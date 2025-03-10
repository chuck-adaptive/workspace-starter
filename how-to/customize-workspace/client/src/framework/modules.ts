import type { InteropClient } from "@openfin/core/src/api/interop/InteropClient";
import type { WorkspacePlatformModule } from "@openfin/workspace-platform";
import { getApp, getApps } from "./apps";
import { launch } from "./launch";
import { subscribeLifecycleEvent, unsubscribeLifecycleEvent } from "./lifecycle";
import { createLogger } from "./logger-provider";
import type { CustomSettings } from "./shapes";
import type {
	Module,
	ModuleDefinition,
	ModuleEntry,
	ModuleEntryTypes,
	ModuleHelpers,
	ModuleImplementation,
	ModuleList,
	ModuleTypes
} from "./shapes/module-shapes";
import {
	getCurrentColorSchemeMode,
	getCurrentPalette,
	getCurrentIconFolder,
	getCurrentThemeId
} from "./themes";

import { getVersionInfo } from "./version";

const logger = createLogger("Modules");
let passedSessionId: string;
let bootstrapped = false;

async function getInteropClient(): Promise<InteropClient | undefined> {
	if (bootstrapped) {
		// if an interop broker has been assigned for the platform
		// provide a proxy to the requesting integration
		return fin.Interop.connectSync(fin.me.uuid, {});
	}
	// otherwise returned undefined as they should be calling after the bootstrapped lifecycle event
	logger.warn(
		"A request was made for the interop client before bootstrapping had completed. Please listen for the lifeCycle event 'after-bootstrap' before use."
	);
}

/**
 * All the loaded modules.
 */
const loadedModules: {
	[url: string]: ModuleEntryTypes;
} = {};

/**
 * Setup any required listeners needed by this module and specify the session id for this instance of the platform
 */
export async function init(sessionId: string) {
	logger.info(
		`Initializing and listening for the after bootstrap lifecycle event and setting the passed sessionId: ${sessionId}`
	);
	passedSessionId = sessionId;
	const bootstrappedLifeCycleId: string = subscribeLifecycleEvent(
		"after-bootstrap",
		async (_platform: WorkspacePlatformModule) => {
			bootstrapped = true;
			unsubscribeLifecycleEvent(bootstrappedLifeCycleId, "after-bootstrap");
		}
	);
}

/**
 * Load the modules from the list.
 * @param moduleList The list of modules to load.
 * @param moduleType The type of modules to load.
 * @returns Nothing.
 */
export async function loadModules<
	M extends ModuleImplementation<O, H>,
	H = ModuleHelpers,
	O = unknown,
	D extends ModuleDefinition<O> = ModuleDefinition<O>
>(moduleList: ModuleList | undefined, moduleType: ModuleTypes): Promise<ModuleEntry<M, H, O, D>[]> {
	const loaded: ModuleEntry<M, H, O, D>[] = [];

	if (Array.isArray(moduleList?.modules)) {
		for (const moduleDefinition of moduleList.modules) {
			const module = await loadModule<M, H, O, D>(moduleDefinition, moduleType);
			if (module) {
				loaded.push(module);
			}
		}
	}

	return loaded;
}

/**
 * Load a module if it is enabled and add it to the loaded list.
 * @param moduleDefinition The module definition to load.
 * @param moduleType The type of module to load.
 * @returns Nothing.
 */
export async function loadModule<
	M extends ModuleImplementation<O, H>,
	H = ModuleHelpers,
	O = unknown,
	D extends ModuleDefinition<O> = ModuleDefinition<O>
>(moduleDefinition: ModuleDefinition, moduleType: ModuleTypes): Promise<ModuleEntry<M, H, O, D> | undefined> {
	if (!moduleDefinition.id) {
		logger.warn("Module does not have an id defined");
		return;
	}
	if (moduleDefinition.enabled ?? true) {
		if (!moduleDefinition.url) {
			logger.error(`Module '${moduleDefinition.id}' can not be loaded without a url`);
			return;
		}
		if (!loadedModules[moduleDefinition.url]) {
			try {
				logger.info(`Loading module '${moduleDefinition.url}' for type ${moduleType}`);
				const mod: Module = await import(/* webpackIgnore: true */ moduleDefinition.url);
				if (!mod.entryPoints) {
					logger.error(`Module '${moduleDefinition.id}' has no exported entryPoints`);
					return;
				}
				const entryPoints = Object.keys(mod.entryPoints);
				if (!entryPoints.includes(moduleType)) {
					logger.error(
						`Module was loaded, but is does not contain an entry point for type ${moduleType}, it only contains ${entryPoints.join(
							", "
						)}`
					);
					return;
				}
				logger.info(`Module contains implementations for ${entryPoints.join(", ")}`);
				loadedModules[moduleDefinition.url] = {};

				for (const entryPoint of entryPoints) {
					loadedModules[moduleDefinition.url][entryPoint] = {
						definition: entryPoint === moduleType ? moduleDefinition : undefined,
						isInitialised: false,
						implementation: mod.entryPoints[entryPoint]
					};
				}
			} catch (err) {
				logger.error(`Error loading module ${moduleDefinition.url}`, err);
				return;
			}
		} else {
			logger.info(`Module already loaded '${moduleDefinition.url}' using cached version`);
			if (!loadedModules[moduleDefinition.url][moduleType]) {
				logger.error(`Module from cache does not contain an entry point for type ${moduleType}`);
				return;
			}
			loadedModules[moduleDefinition.url][moduleType].definition = moduleDefinition;
		}

		return loadedModules[moduleDefinition.url][moduleType] as ModuleEntry<M, H, O, D>;
	}
}

/**
 * Initialize modules of the given type.
 * @param moduleType The type of modules to initialize.
 * @returns The list of initialized modules.
 */
export async function initializeModules<
	M extends ModuleImplementation<O, H>,
	H = ModuleHelpers,
	O = unknown,
	D extends ModuleDefinition<O> = ModuleDefinition<O>
>(moduleEntries: ModuleEntry<M, H, O, D>[], helpers: H): Promise<void> {
	for (const moduleEntry of moduleEntries) {
		await initializeModule<M, H, O, D>(moduleEntry, helpers);
	}
}

/**
 * Initialize a single module entry.
 * @param moduleEntry The entry to initialize.
 * @returns The initialized module implementation.
 */
export async function initializeModule<
	M extends ModuleImplementation<O, H>,
	H = ModuleHelpers,
	O = unknown,
	D extends ModuleDefinition<O> = ModuleDefinition<O>
>(moduleEntry: ModuleEntry<M, H, O, D>, helpers: H): Promise<M | undefined> {
	if (!moduleEntry.isInitialised) {
		if (moduleEntry.implementation.initialize) {
			try {
				logger.info(`Initializing module '${moduleEntry.definition.id}'`);
				await moduleEntry.implementation.initialize(moduleEntry.definition, createLogger, helpers);
				moduleEntry.isInitialised = true;
			} catch (err) {
				logger.error(`Error initializing module ${moduleEntry.definition.id}`, err);
			}
		} else {
			moduleEntry.isInitialised = true;
		}
	}

	return moduleEntry.isInitialised ? moduleEntry.implementation : undefined;
}

/**
 * Close down modules of the given type.
 * @param moduleType The type of modules to close down.
 * @returns Nothing.
 */
export async function closedownModules(moduleType: ModuleTypes): Promise<void> {
	for (const url in loadedModules) {
		const moduleEntry = loadedModules[url][moduleType];
		if (moduleEntry) {
			await closedownModule(moduleEntry);
		}
	}
}

/**
 * Close down a single module entry.
 * @param moduleEntry The entry to close down.
 * @returns Nothing.
 */
export async function closedownModule<
	M extends ModuleImplementation<O, H>,
	H = ModuleHelpers,
	O = unknown,
	D extends ModuleDefinition<O> = ModuleDefinition<O>
>(moduleEntry: ModuleEntry<M, H, O, D>): Promise<void> {
	if (moduleEntry.isInitialised) {
		if (moduleEntry.implementation.closedown) {
			try {
				logger.info(`Closing down module '${moduleEntry.definition.id}'`);
				await moduleEntry.implementation.closedown();
				moduleEntry.isInitialised = false;
			} catch (err) {
				logger.error(`Error closing down module ${moduleEntry.definition.id}`, err);
			}
		} else {
			moduleEntry.isInitialised = false;
		}
	}
}

export function getDefaultHelpers(settings: CustomSettings): ModuleHelpers {
	return {
		rootUrl: settings?.platformProvider?.rootUrl,
		sessionId: passedSessionId,
		getApps: async () => {
			logger.info("getApps: getting public apps for module.");
			return getApps({ private: false });
		},
		getCurrentThemeId,
		getCurrentIconFolder,
		getCurrentPalette,
		getCurrentColorSchemeMode,
		getVersionInfo,
		getInteropClient,
		launchApp: async (appId: string) => {
			logger.info(`launchApp: Looking up appId: ${appId}`);
			const app = await getApp(appId);
			if (app === undefined || app === null) {
				logger.warn(`launchApp: The specified appId: ${appId} is not listed in this platform.`);
			} else {
				logger.info(`launchApp: Launching app with appId: ${appId}`);
				await launch(app);
				logger.info(`launchApp: App with appId: ${appId} launched.`);
			}
		},
		subscribeLifecycleEvent,
		unsubscribeLifecycleEvent
	};
}

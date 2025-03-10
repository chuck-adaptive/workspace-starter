import {
	ButtonStyle,
	TemplateFragmentTypes,
	type ButtonTemplateFragment,
	type ImageTemplateFragment,
	type PlainContainerTemplateFragment,
	type TemplateFragment,
	type TextTemplateFragment
} from "@openfin/workspace";
import type * as CSS from "csstype";
import type { PlatformApp } from "./shapes/app-shapes";
import { ColorSchemeMode } from "./shapes/theme-shapes";
import { getCurrentColorSchemeMode, getCurrentPalette } from "./themes";

export async function createHelp(
	title: string,
	description: string[],
	examples: string[]
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ layout: PlainContainerTemplateFragment; data: any }> {
	const palette = await getCurrentPalette();
	const additionalData = {};
	const fragments: TemplateFragment[] = [];
	for (let i = 0; i < description.length; i++) {
		const descriptionKey = `desc-${i}`;
		additionalData[descriptionKey] = description[i];
		fragments.push(
			await createText(descriptionKey, 12, {
				padding: "6px 0px"
			})
		);
	}
	const exampleFragments: TemplateFragment[] = [];
	for (let i = 0; i < examples.length; i++) {
		const exampleKey = `line-${i}`;
		additionalData[exampleKey] = examples[i];
		exampleFragments.push(
			await createText(exampleKey, 12, {
				fontFamily: "monospace",
				whiteSpace: "nowrap"
			})
		);
	}
	if (exampleFragments.length > 0) {
		fragments.push(
			await createContainer("column", exampleFragments, {
				padding: "10px",
				marginTop: "6px",
				backgroundColor: palette.inputBackground,
				color: palette.inputColor,
				borderRadius: "5px",
				overflow: "auto"
			})
		);
	}

	const layoutData = await createLayout(title, undefined, fragments);

	return {
		layout: layoutData.layout,
		data: {
			...layoutData.data,
			...additionalData
		}
	};
}

export async function createContainer(
	containerType: "column" | "row",
	children: TemplateFragment[],
	style?: CSS.Properties
): Promise<PlainContainerTemplateFragment> {
	return {
		type: TemplateFragmentTypes.Container,
		style: {
			display: "flex",
			flexDirection: containerType,
			...style
		},
		children
	};
}

export async function createTitle(
	dataKey: string,
	fontSize: number = 12,
	fontWeight: string = "bold",
	style?: CSS.Properties
): Promise<TextTemplateFragment> {
	const palette = await getCurrentPalette();
	return {
		type: TemplateFragmentTypes.Text,
		dataKey,
		style: {
			color: palette.textDefault,
			fontSize: `${fontSize ?? 12}px`,
			fontWeight,
			overflow: "hidden",
			whiteSpace: "nowrap",
			textOverflow: "ellipsis",
			...style
		}
	};
}

export async function createText(
	dataKey: string,
	fontSize: number = 12,
	style?: CSS.Properties
): Promise<TextTemplateFragment> {
	return {
		type: TemplateFragmentTypes.Text,
		dataKey,
		style: {
			fontSize: `${fontSize ?? 12}px`,
			...style
		}
	};
}

export async function createImage(
	dataKey: string,
	alternativeText: string,
	style?: CSS.Properties
): Promise<ImageTemplateFragment> {
	return {
		type: TemplateFragmentTypes.Image,
		dataKey,
		alternativeText,
		style: {
			...style
		}
	};
}

export async function createButton(
	buttonStyle: ButtonStyle,
	titleKey: string,
	action: string,
	style?: CSS.Properties,
	children?: TemplateFragment[]
): Promise<ButtonTemplateFragment> {
	const palette = await getCurrentPalette();
	const buttonOptions =
		buttonStyle === ButtonStyle.Secondary
			? {
					border: `1px solid ${palette.inputColor}`
			  }
			: {};
	return {
		type: TemplateFragmentTypes.Button,
		buttonStyle,
		children: children ?? [await createText(titleKey, 12)],
		action,
		style: {
			...buttonOptions,
			...style
		}
	};
}

export async function createLabelledValue(
	labelKey: string,
	valueKey: string,
	style?: CSS.Properties
): Promise<PlainContainerTemplateFragment> {
	const palette = await getCurrentPalette();
	return {
		type: TemplateFragmentTypes.Container,
		style: {
			display: "flex",
			flexDirection: "column",
			marginBottom: "9px",
			...style
		},
		children: [
			await createText(labelKey, 11, { fontWeight: "bold", color: palette.brandPrimary }),
			await createText(valueKey, 14)
		]
	};
}

export async function createTable(
	tableData: string[][],
	colSpans: number[],
	tableIndex: number,
	data: { [id: string]: string }
): Promise<TemplateFragment> {
	const palette = await getCurrentPalette();
	const scheme = await getCurrentColorSchemeMode();

	const headerColor = scheme === ColorSchemeMode.Dark ? palette.background2 : palette.background5;
	const cellColor = scheme === ColorSchemeMode.Dark ? palette.background5 : palette.background2;

	const cells: TemplateFragment[] = [];
	const finalColSpans = colSpans.slice();
	for (let col = 0; col < tableData[0].length; col++) {
		const headerKey = `table${tableIndex}_header${col}`;
		data[headerKey] = tableData[0][col] ?? "";
		cells.push(
			await createText(headerKey, 10, {
				padding: "3px",
				whiteSpace: "nowrap",
				fontWeight: "bold",
				backgroundColor: headerColor
			})
		);

		if (colSpans.length === 0) {
			finalColSpans.push(1);
		}
	}

	for (let row = 1; row < tableData.length; row++) {
		for (let col = 0; col < tableData[0].length; col++) {
			const rowColKey = `table${tableIndex}_col${col}_row${row}`;
			data[rowColKey] = tableData[row][col] ?? "";
			cells.push(await createText(rowColKey, 10, { padding: "3px", whiteSpace: "nowrap" }));
		}
	}

	return createContainer("row", cells, {
		display: "grid",
		gridTemplateColumns: finalColSpans.map((s) => `${s}fr`).join(" "),
		marginBottom: "10px",
		overflow: "auto",
		background: cellColor,
		border: `1px solid ${headerColor}`
	});
}

export async function createLink(
	labelKey: string,
	action: string,
	fontSize: number = 10,
	style?: CSS.Properties
): Promise<TemplateFragment> {
	return {
		type: TemplateFragmentTypes.Button,
		buttonStyle: ButtonStyle.TextOnly,
		children: [await createText(labelKey, fontSize)],
		action,
		style: {
			padding: 0,
			border: 0,
			fontWeight: "normal",
			textDecoration: "underline",
			...style
		}
	};
}

export async function createLayout(
	title: string,
	icon: string | undefined,
	bodyFragments: TemplateFragment[],
	buttons?: { title: string; action: string }[]
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ layout: PlainContainerTemplateFragment; data: any }> {
	const palette = await getCurrentPalette();
	const additionalData: { [id: string]: string } = {
		title
	};

	const header: TemplateFragment[] = [];
	if (icon) {
		header.push(
			await createImage("icon", "", {
				width: "16px",
				height: "16px"
			})
		);
		additionalData.icon = icon;
	}
	header.push(await createTitle("title"));

	const buttonsFragments: TemplateFragment[] = [];
	if (Array.isArray(buttons)) {
		for (let i = 0; i < buttons.length; i++) {
			buttonsFragments.push(await createButton(ButtonStyle.Primary, `buttonTitle${i}`, buttons[i].action));
			additionalData[`buttonTitle${i}`] = buttons[i].title;
		}
	}

	return {
		layout: await createContainer(
			"column",
			[
				await createContainer("row", header, {
					borderBottom: `1px solid ${palette.background6}`,
					paddingBottom: "5px",
					gap: "5px",
					alignItems: "center"
				}),
				await createContainer("column", bodyFragments, {
					flex: "1",
					gap: "10px"
				}),
				await createContainer("row", buttonsFragments, {
					justifyContent: "center",
					gap: "10px"
				})
			],
			{
				padding: "10px",
				gap: "10px",
				flex: "1"
			}
		),
		data: additionalData
	};
}

export async function createApp(
	app: PlatformApp,
	appIcon: string,
	action: string
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ layout: PlainContainerTemplateFragment; data: any }> {
	const palette = await getCurrentPalette();
	const additionalData: { [id: string]: string } = {};

	const body: TemplateFragment[] = [];
	if (app.description) {
		body.push(await createText("description", 12));
		additionalData.description = app.description;
	}

	if (Array.isArray(app.images) && app.images.length > 0 && app.images[0].src) {
		body.push(
			await createImage("screenshot", "Screenshot", {
				border: `1px solid ${palette.background6}`
			})
		);
		additionalData.screenshot = app.images[0].src;
	}

	const layoutData = await createLayout(app.title, appIcon, body, [{ title: action, action }]);

	return {
		layout: layoutData.layout,
		data: {
			...layoutData.data,
			...additionalData
		}
	};
}

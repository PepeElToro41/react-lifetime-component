import React, { PropsWithChildren, ReactNode, isValidElement, useMemo } from "@rbxts/react";
import { LifetimeController } from "./LifetimeController";

type ReactChildren = Map<string | number, React.Element>;

function CreateChildrenMap(children: ReactNode | undefined, append?: ReactChildren) {
	const appened: ReactChildren = append ?? new Map();
	if (!children) return appened;

	if (isValidElement(children)) {
		CreateChildrenMap([children], appened);
		return appened;
	}

	for (const [key, element] of children as ReactChildren) {
		if (isValidElement(element)) {
			if (element.key !== undefined) {
				appened.set(element.key, element);
			} else {
				appened.set(key, element);
			}
		} else if (typeIs(element, "table")) {
			CreateChildrenMap(element, appened);
		}
	}
	return appened;
}

interface LifetimeComponentProps extends PropsWithChildren {
	CanRecover?: boolean;
}

function LifetimeComponent(props: LifetimeComponentProps) {
	const [_, setRerender] = React.useState({});
	const controller = useMemo(() => {
		const controller = new LifetimeController();
		controller.SetUpdater(() => setRerender({}));
		return controller;
	}, []);
	controller.CanRecover = props.CanRecover ?? false;

	const children = CreateChildrenMap(props.children);

	controller.ProcessChildren(children);
	const toRender = controller.RenderComponents();
	return <React.Fragment>{toRender}</React.Fragment>;
}

export default LifetimeComponent;

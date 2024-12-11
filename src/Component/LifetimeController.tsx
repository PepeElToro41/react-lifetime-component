import { useAsyncEffect } from "@rbxts/pretty-react-hooks";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "@rbxts/react";
const HttpService = game.GetService("HttpService");
const RunService = game.GetService("RunService");

type ReactChildren = Map<string | number, React.Element>;

interface ComponentState {
	Key: string | number;
	Element: React.ReactNode;
	UID: string;
}
interface ReactElement extends React.Element {
	type: any;
}

type PropsType = Record<any, any>;

declare function newproxy(): string;

const LifetimeInternal = newproxy();
const UIDInternal = newproxy();

export class LifetimeController {
	CanRecover: boolean = false;
	AllComponents: Map<string, ComponentState> = new Map();
	CurrentRendered: Map<string | number, string> = new Map(); // map<key, uid>
	Updater: () => void = () => {};

	SetUpdater(updater: () => void) {
		this.Updater = updater;
	}
	GetComponent(uid: string) {
		return this.AllComponents.get(uid);
	}
	IsComponentActive(uid: string) {
		const component = this.GetComponent(uid);
		if (!component) return false;
		const render = this.GetRendered(component);
		if (render === undefined) return false;
		return this.CurrentRendered.get(render) === uid;
	}
	GetRendered(component: ComponentState) {
		const renderKey = this.CurrentRendered.get(component.Key);
		if (renderKey === undefined) return renderKey;
		if (renderKey !== component.UID) return;
		return component.Key;
	}
	RemoveRenderedByUID(uid: string) {
		const component = this.GetComponent(uid);
		if (!component) return;
		const rendered = this.CurrentRendered.get(component.Key);
		if (rendered === uid) {
			this.CurrentRendered.delete(component.Key);
		}
	}
	UnlistComponent(uid: string) {
		if (this.IsComponentActive(uid)) return;
		this.RemoveRenderedByUID(uid);
		this.AllComponents.delete(uid);
		this.Updater();
	}

	RegistryComponent(element: React.Element, key: string | number) {
		const uid = HttpService.GenerateGUID();
		const newComponent: ComponentState = {
			Key: key,
			Element: element,
			UID: uid,
		};
		this.AllComponents.set(uid, newComponent);
		this.CurrentRendered.set(key, uid);
	}
	UpdateComponent(uid: string, element: React.Element) {
		const component = this.AllComponents.get(uid);
		if (!component) return;
		this.AllComponents.set(uid, {
			...component,
			Element: element,
		});
	}
	GetRenderedComponentByKey(key: string | number) {
		for (const [_, component] of this.AllComponents) {
			if (component.Key === key) {
				return component;
			}
		}
	}

	ProcessChildren(children: ReactChildren) {
		const newChildren = new Map<string | number, string>();

		this.CurrentRendered.forEach((uid, key) => {
			const child = children.get(key);
			if (!child) return;
			newChildren.set(key, uid);
			this.UpdateComponent(uid, child);
		});

		this.CurrentRendered = newChildren;

		children.forEach((child, key) => {
			const uid = this.CurrentRendered.get(key);
			if (uid === undefined) {
				if (this.CanRecover) {
					const component = this.GetRenderedComponentByKey(key);
					if (component) {
						this.UpdateComponent(component.UID, child);
						this.CurrentRendered.set(key, component.UID);
						return;
					}
				}
				this.RegistryComponent(child, key);
			}
		});
	}
	RenderComponents() {
		const renderedChildren: ReactChildren = new Map();
		this.AllComponents.forEach((component, uid) => {
			const child: ReactChildren = new Map();
			const element = component.Element as ReactElement;
			if ("props" in element) {
				const props = (element.props as PropsType) ?? {};
				props[LifetimeInternal] = this;
				props[UIDInternal] = uid;
				child.set(component.Key, React.createElement(element.type, { ...props }));
			} else {
				child.set(component.Key, element);
			}

			renderedChildren.set(uid, <React.Fragment>{child}</React.Fragment>);
		});
		return renderedChildren;
	}
}

/* ---------------------------------- HOOKS --------------------------------- */

interface IntrinsicData {
	uid: string | undefined;
	controller: LifetimeController | undefined;
}

function useIntrinsicData(props: PropsType): IntrinsicData | undefined {
	const uid = props[UIDInternal] as string | undefined;
	const controller = props[LifetimeInternal] as LifetimeController | undefined;
	if (uid === undefined || !controller) return undefined;

	return { uid, controller };
}

/**
 * Checks if the component is active in the LifetimeController children list (returns true when it's not inside a LifetimeComponent)
 * @param props your component props
 * @returns true if the component is active
 */
export function useComponentIsActive(props: PropsType) {
	const { uid, controller } = useIntrinsicData(props)!;
	if (uid === undefined || !controller) return true;
	return controller.IsComponentActive(uid);
}

/**
 * Checks if the component was rendered instead of a LifetimeComponent
 */
export function useIsLifetimeComponent(props: PropsType) {
	const data = useIntrinsicData(props);
	const isComponent = useMemo(() => {
		// using useMemo to avoid this from ever changing for whatever reason
		return data !== undefined;
	}, []);

	return isComponent;
}

/**
 * Returns a function to set the time in seconds the component will be alive for
 * @param props your component props
 * @param seconds initial lifetime in seconds (can be reassigned later)
 */
export function useComponentLifetime(props: PropsType, initLifetime?: number) {
	const [lifetime, setLifetime] = useState<number | undefined>(initLifetime);
	const [unmountTick, setUnmountTick] = useState<number>();
	const { uid, controller } = useIntrinsicData(props)!;

	if (uid === undefined || !controller)
		throw 'You cant use useComponentLifetime hook in components that are not children of a "LifetimeComponent"';
	const isActive = controller.IsComponentActive(uid);

	useEffect(() => {
		if (isActive) {
			setUnmountTick(undefined);
		} else {
			setUnmountTick(os.clock());
		}
	}, [isActive]);

	useEffect(() => {
		if (unmountTick === undefined) return;
		if (isActive) return;
		if (lifetime === undefined) return;

		const connector = RunService.Heartbeat.Connect(() => {
			const now = os.clock();
			if (now - unmountTick > lifetime) {
				controller.UnlistComponent(uid);
				setLifetime(undefined);
			}
		});
		return () => connector.Disconnect();
	}, [isActive, unmountTick, lifetime]);

	return setLifetime;
}
/**
 * Defers the component unmount until the given number of frames have passed
 * @param props your component props
 * @param steps the number of frames to defer the component (default 1)
 */
export function useDeferLifetime(props: PropsType, frames = 1) {
	const deferred = useRef(0);
	const active = useComponentIsActive(props);
	const { uid, controller } = useIntrinsicData(props)!;

	if (uid === undefined || !controller)
		throw 'You cant use useComponentLifetime hook in components that are not children of "LifetimeComponent"';

	useEffect(() => {
		if (active) {
			deferred.current = 0;
			return;
		}

		const connection = RunService.Heartbeat.Connect(() => {
			deferred.current += 1;
			if (deferred.current < frames) return;
			controller.UnlistComponent(uid);
		});

		return () => connection.Disconnect();
	}, [active, frames]);
}

/**
 * Returns a function to set an async function that will run when the component is not active
 * and then removes the component when the async function resolves
 * @param props your component props
 * @param asyncCallback the initial async function (can be reassigned later)
 */
export function useLifetimeAsync(props: PropsType, asyncCallback?: () => Promise<any>) {
	const { uid, controller } = useIntrinsicData(props)!;
	const [asyncLifetime, setAsyncLifetime] = useState(() => asyncCallback);
	const active = useComponentIsActive(props);

	if (uid === undefined || !controller)
		throw 'You cant use useComponentLifetime hook in components that are not children of "LifetimeComponent"';

	const OnSetAsync = useCallback((asyncCallback: () => Promise<any>) => {
		setAsyncLifetime(() => {
			return asyncCallback;
		});
	}, []);

	useAsyncEffect(() => {
		if (!asyncLifetime || active) return Promise.resolve();

		return asyncLifetime().finally(() => {
			controller.UnlistComponent(uid);
		});
	}, [active, asyncLifetime]);

	return OnSetAsync;
}

export function SanitizeProps<T extends PropsType>(props: T): T {
	if (!typeIs(props, "table")) return props;

	const newProps: PropsType = {};
	for (const [key, value] of pairs(props)) {
		const unknownKey = key as string;
		if (unknownKey === LifetimeInternal || unknownKey === UIDInternal) continue;
		newProps[unknownKey] = value;
	}
	return newProps as T;
}

## React Lifetime Component

A React util that allows you to delay the component's unmounting to your liking.

## Installation

`npm i @rbxts/react-lifetime-component`

## Usage

Create a LifetimeComponent and add children inside. When some children are removed, they will not be unmounted. But rather, the children can control when it's unmounted.

This supports both components with `key` or a `Map<string, Element>` as children (using a `Map` is recommended).

> (do not use intrinsic elements (`frame`, `textlabel`) or fragments as children)

The information about the lifetime in injected in the `props` of the component. _(You dont need to do anything to the props and can be used as usual)_

Any hooks should get the props from the component first. This info is only injected in the component, You can pass the `props` further down the tree manually, or share them with a React.Context.

## Example

```tsx
import React, { PropsWithChildren, useEffect, useMemo } from "@rbxts/react";
import { LifetimeComponent, useLifetimeAsync } from "@rbxts/react-lifetime-component";

// create a list of windows (edit this to open windows)
// we are gonna use @rbxts/charm for this
const windowsList = Charm.atom<Map<string, React.Element>>(new Map());

// this renders all the windows
function WindowsRenderer() {
	const windows = useAtom(windowsList);

	const windowsRender = useMemo(() => {
		const toRender: Map<string, React.Element> = new Map();
		windows.forEach((render, key) => {
			// create a window element with the `render` as children
			const element = <Window>{render}</Window>;

			toRender.set(key, element);
		});
		return toRender;
	}, [windows]);

	return <LifetimeComponent>{windowsRender}</LifetimeComponent>;
}

// this is the window component
function Window(props: PropsWithChildren) {
	const [anchor, motion] = useMotion(-0.5); // start outside of view

	useEffect(() => {
		// move the window to the center of the screen on mount
		motion.spring(0.5);
	}, []);

	// useLifetimeAsync will remove the component when the async function resolves
	// remember to pass the props where the info is injected
	useLifetimeAsync(props, () => {
		return Promise.try(() => {
			motion.spring(1.5); // move the window outside of the view again
			task.wait(1); // delay the removal of the component to wait for the spring animation to finish
		});
	});

	const position = anchor.map((x) => UDim2.fromScale(x, 0.5));

	return (
		<frame Position={position} AnchorPoint={new Vector2(0.5, 0.5)} Size={UDim2.fromOffset(200, 200)}>
			{props.children}
		</frame>
	);
}
```

---

## Hooks

### useComponentIsActive

Checks if the component is active in the LifetimeController children list (returns true when it's not inside a LifetimeComponent)

```tsx
function Window(props: PropsWithChildren) {
	const isActive = useComponentIsActive(props);

	// disable all window interactions when the component is not active
	return <frame Interactable={isActive}>{children}</frame>;
}
```

### useIsLifetimeComponent

Checks if the component was rendered inside of a LifetimeComponent

```tsx
function Window(props: PropsWithChildren) {
	if (useIsLifetimeComponent(props)) {
		// do something, it's ensured that this will not change,
		// so it's somewhat okay to use conditional hooks here
	}

	return <frame>{children}</frame>;
}
```

### useComponentLifetime

Returns a function to set the time in seconds the component will be alive for.

An initial value can be given allowing you to not use the assign function.

```tsx
function Window(props: PropsWithChildren) {
	// unmounting will be delayed for 5 seconds
	useComponentLifetime(props, 5);

	// you can instead assign it, but it's more verbose
	const setLifetime = useComponentLifetime(props);

	useEffect(() => {
		setLifetime(5); // set the lifetime to 5 seconds
	}, []);

	return <frame>{children}</frame>;
}
```

### useDeferLifetime

Defers the component unmount until the given number of frames have passed

```tsx
function Window(props: PropsWithChildren) {
	// the component will be unmounted in the next frame
	useDeferLifetime(props);

	// you can also pass the number of frames to defer the component
	useDeferLifetime(props, 5); // the component will be unmounted in the next 5 frames

	return <frame>{children}</frame>;
}
```

### useLifetimeAsync

Returns a function to set an async function that will run when the component is not active. The component will be removed when the async function resolves or fails.

An initial value can be given allowing you to not use the assign function.

```tsx
function Window(props: PropsWithChildren) {
	// the component will be removed when the async function resolves
	useLifetimeAsync(props, () => {
		return Promise.try(() => {
			// do something
		});
	});

	// you can instead assign it, but it's more verbose
	const setAsync = useLifetimeAsync(props);

	useEffect(() => {
		setAsync(() => {
			return Promise.try(() => {
				// do something
			});
		});
	}, []);

	return <frame>{children}</frame>;
}
```

### LifetimeComponent `CanRecover`

LifetimeComponent has a `CanRecover` prop that determines if a component should be recovered if the a children with the same key is found in the lifetimed components.

Right now, if you add a window, remove it, and add it again with the same key you'd end up with two windows, one of them that has lifetime, and the new one you just added.

If you set `CanRecover` to true, when you add the new window, the old one will be recovered, and become re-active again.
This implies that `useIsComponentActive` can return true after it returned false, and that the unmounting hooks can be cancelled.

So for the `Window` component example, you may rewrite it like this to support `CanRecover`:

```tsx
function Window(props: PropsWithChildren) {
	const isActive = useComponentIsActive(props);
	const [anchor, motion] = useMotion(-0.5); // start outside of view

	useEffect(() => {
		if (isActive) {
			motion.spring(0.5); // move the window to the center of the screen
		} else {
			motion.spring(1.5); // move the window outside of the view again
		}
	}, [isActive]);

	useComponentLifetime(props, 1); // use the lifetime, rather than an async function

	const position = anchor.map((x) => UDim2.fromScale(x, 0.5));

	return (
		<frame Position={position} AnchorPoint={new Vector2(0.5, 0.5)} Size={UDim2.fromOffset(200, 200)}>
			{props.children}
		</frame>
	);
}
```

### SanitizeProps

`SanitizeProps` is a helper function that removes the injection from the props passed to the component.

You usually dont need to use this unless you use the spread operator, or iterate over the props.
This returns a new object without mutating the original props.

```tsx
function Window(props: PropsWithChildren) {
	return <frame {...SanitizeProps(props)}>{props.children}</frame>;
}
```

## Caveats

- You cannot use anything that is not a React Component, so adding a `<frame />` or a `<React.Fragment />` might not work. `LifetimeComponent` returns a `React.Fragment` so you can add non-components outside of the LifetimeComponent.

- This touches some react internals, so it's hacky and might break in the future (but it's been tested).

- This uses the props to access the Lifetime Controller, so expect extra keys in the props (it uses `newproxy()` so it's a unique key).

- Not using any of the hooks for control unmounting will cause the component to never be removed (unless the parent component is removed).

- Do not combine unmounting hooks, the will conflict with each other and the behavior is unknown.

- The component is still rendering in the tree when the lifetime is still active, use `useComponentIsActive` to cancel any action that should only happen when the component is active.

_example:_

```tsx
function Window(props: PropsWithChildren) {
	const isActive = useComponentIsActive(props);

	const DoSomething = useCallback(() => {
		if (!isActive) return;
		// do something
	}, [isActive]);

	return (
		<frame>
			<textbutton Event={{ Activated: DoSomething }} />
		</frame>
	);
}
```

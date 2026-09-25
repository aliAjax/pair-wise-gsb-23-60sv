/**
 * 本地环境声明：脚手架未声明 @types/react / @types/react-dom，为遵守“不加依赖”，
 * 在此仅声明本项目实际用到的 React API 与 DOM 元素形状（不安装任何 npm 包）。
 * 领域规则层 src/rules.ts、src/storage.ts 仍接受完整严格类型检查。
 */

declare module "react" {
  export interface FormEvent {
    preventDefault(): void;
  }

  export interface ChangeEvent {
    target: { value: string };
  }

  type SetStateAction<T> = T | ((prevState: T) => T);
  type Dispatch<A> = (value: A) => void;
  interface MutableRefObject<T> {
    current: T;
  }

  export function useState<T>(initialState: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
  export function useEffect(
    effect: () => void | (() => void),
    deps?: readonly unknown[]
  ): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useRef<T>(initialValue: T): MutableRefObject<T>;

  type Component = (props: unknown) => JSX.Element;
  const React: { StrictMode: Component };
  export default React;
}

declare module "react/jsx-runtime" {
  export const Fragment: symbol;
  export function jsx(type: unknown, props: unknown, key?: unknown): unknown;
  export function jsxs(type: unknown, props: unknown, key?: unknown): unknown;
}

declare module "react-dom/client" {
  export interface Root {
    render(node: unknown): void;
  }
  export function createRoot(container: Element): Root;
}

declare namespace JSX {
  interface Element {}
  interface ElementClass {}
  interface ElementAttributesProperty {
    props: unknown;
  }
  // 让所有组件元素接受 React 的保留属性 key
  type LibraryManagedAttributes<_C, P> = P & { key?: string | number | null };

  interface DOMAttributes {
    children?: unknown;
    onClick?: (event: unknown) => void;
    onChange?: (event: import("react").ChangeEvent) => void;
    onSubmit?: (event: import("react").FormEvent) => void;
  }

  interface IntrinsicAttributes extends DOMAttributes {
    [name: string]: unknown;
  }

  interface IntrinsicElements {
    [elemName: string]: IntrinsicAttributes;
  }
}

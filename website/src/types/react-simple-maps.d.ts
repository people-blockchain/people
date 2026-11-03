declare module "react-simple-maps" {
  import type { ReactNode, CSSProperties } from "react";

  export function ComposableMap(props: {
    projectionConfig?: Record<string, number>;
    width?: number;
    height?: number;
    className?: string;
    children?: ReactNode;
  }): JSX.Element;

  export function Geographies(props: {
    geography: string;
    children: (args: { geographies: Array<{ rsmKey: string; properties: Record<string, unknown> }> }) => ReactNode;
  }): JSX.Element;

  export function Geography(props: {
    geography: { rsmKey: string; properties: Record<string, unknown> };
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    style?: Record<string, CSSProperties>;
  }): JSX.Element;
}

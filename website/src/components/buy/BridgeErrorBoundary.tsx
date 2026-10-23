"use client";

import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; message: string; retryLabel: string };
type State = { failed: boolean; attempt: number };

/** Keeps a widget crash (for example a rejected signature) from taking the page down. */
export class BridgeErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="rounded-2xl border border-line bg-surface-2 p-4 text-sm text-ink">
          <p>{this.props.message}</p>
          <button
            type="button"
            className="mt-3 min-h-[44px] rounded-lg border border-line px-4"
            onClick={() => this.setState((s) => ({ failed: false, attempt: s.attempt + 1 }))}
          >
            {this.props.retryLabel}
          </button>
        </div>
      );
    }
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}

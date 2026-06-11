import { Component, type ErrorInfo, type ReactNode } from "react";
import "./AppErrorBoundary.css";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

/**
 * @description Affiche une erreur React au lieu d'un ecran noir en production.
 */
export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erreur interface Mangatheque :", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error-boundary">
          <h1>Une erreur est survenue</h1>
          <p>{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => {
              window.location.hash = "#/";
              window.location.reload();
            }}
          >
            Recharger l'application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

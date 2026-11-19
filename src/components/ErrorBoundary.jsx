import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Erro inesperado na interface.' };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#121929] border border-white/[0.08] p-6 space-y-4">
            <h1 className="text-lg font-bold text-rose-400">Algo deu errado na interface</h1>
            <p className="text-sm text-slate-300">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium cursor-pointer"
            >
              Recarregar aplicativo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import React from 'react';

export default function Interruptor({ ativo, onChange, rotulo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ativo}
      aria-label={rotulo}
      onClick={() => onChange(!ativo)}
      className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${ativo ? 'bg-indigo-500' : 'bg-white/[0.12]'}`}
    >
      <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${ativo ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
    </button>
  );
}

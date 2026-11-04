import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { fetchPainel, fetchCadernoErros } from '../services/api';

const ESTADOS = {
  atacar: { rotulo: 'Atacar', cor: 'text-rose-400' },
  dominado: { rotulo: 'Dominado', cor: 'text-emerald-400' },
  ok: { rotulo: 'Ok', cor: 'text-slate-400' },
  'poucos-dados': { rotulo: 'Poucos dados', cor: 'text-slate-500' },
  'nao-praticado': { rotulo: 'Não praticado', cor: 'text-slate-500' }
};

const corDaTaxa = (taxa) => (taxa === null ? 'bg-white/[0.1]' : taxa >= 75 ? 'bg-emerald-400' : taxa >= 60 ? 'bg-indigo-400' : 'bg-rose-400');
const formatarTempo = (s) => (s === null ? '—' : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

function Secao({ titulo, subtitulo, children }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">{titulo}</h2>
        {subtitulo && <p className="text-sm text-slate-500 mt-1">{subtitulo}</p>}
      </div>
      {children}
    </section>
  );
}

function Barra({ valor, className = '' }) {
  return (
    <div className={`h-1.5 rounded-full bg-white/[0.06] overflow-hidden ${className}`}>
      <div className={`h-full ${corDaTaxa(valor)}`} style={{ width: `${valor ?? 0}%` }} />
    </div>
  );
}

function Numero({ rotulo, valor, detalhe, cor = 'text-slate-100' }) {
  return (
    <div>
      <div className="text-sm text-slate-500">{rotulo}</div>
      <div className={`text-4xl font-bold tracking-tight mt-1 ${cor}`}>{valor}</div>
      <div className="text-sm text-slate-500 mt-1">{detalhe}</div>
    </div>
  );
}

export default function VisaoGeral({ onTreinarTopico, onStartCadernoQuiz }) {
  const [painel, setPainel] = useState(null);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState('');
  const [abrindoRevisao, setAbrindoRevisao] = useState(false);

  useEffect(() => {
    fetchPainel().then(setPainel).catch((e) => setErro(e.message));
  }, []);

  const revisarAgora = async () => {
    setAbrindoRevisao(true);
    try {
      const itens = await fetchCadernoErros(true);
      onStartCadernoQuiz(itens.slice(0, 20));
    } finally {
      setAbrindoRevisao(false);
    }
  };

  if (erro) return <p className="text-rose-400">{erro}</p>;
  if (!painel) return <p className="text-slate-500">Carregando...</p>;

  const { resumo, revisar, atacar, dominados, disciplinas, dias } = painel;

  if (resumo.respondidas === 0) {
    return (
      <div className="py-12 space-y-2">
        <p className="text-lg text-slate-200">Ainda não há questões respondidas.</p>
        <p className="text-slate-500">Faça um treino na aba Treinar e este painel passa a mostrar onde atacar, o que revisar e o que já pode sair do foco.</p>
      </div>
    );
  }

  const variacao = resumo.taxaRecente !== null && resumo.taxaAnterior !== null ? Math.round((resumo.taxaRecente - resumo.taxaAnterior) * 10) / 10 : null;
  const corTaxa = resumo.respondidas < 10 ? 'text-slate-100' : resumo.taxa >= 75 ? 'text-emerald-400' : resumo.taxa < 60 ? 'text-rose-400' : 'text-slate-100';
  const maiorDia = Math.max(1, ...dias.map((d) => d.total));

  return (
    <div className="space-y-10 sm:space-y-14">
      {/* Números principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
        <Numero
          rotulo="Aproveitamento"
          valor={`${Math.round(resumo.taxa)}%`}
          cor={corTaxa}
          detalhe={variacao === null ? `${resumo.acertos} de ${resumo.respondidas}${resumo.respondidas < 10 ? ' · poucos dados' : ''}` : `${variacao >= 0 ? '+' : ''}${variacao} pts vs. 20 anteriores`}
        />
        <Numero rotulo="Questões respondidas" valor={resumo.respondidas} detalhe={`${resumo.acertos} acertos`} />
        <Numero rotulo="Tempo por questão" valor={formatarTempo(resumo.tempoMedio)} detalhe="limite da prova: 3m30s" />
        <Numero rotulo="Revisões para hoje" valor={revisar.vencidasHoje} detalhe={`${revisar.pendentes} no caderno`} />
      </div>

      {/* Atacar */}
      <Secao titulo="Onde atacar" subtitulo="Tópicos com mais chance de render pontos, do mais urgente ao menos.">
        {atacar.length === 0 ? (
          <p className="text-slate-400">Nenhum ponto fraco claro ainda. Um tópico aparece aqui depois de 3 respostas com menos de 70% de acerto.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {atacar.map((t) => (
              <li key={t.disciplina + t.topico} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="min-w-0 sm:flex-1">
                  <div className="text-base text-slate-100 sm:truncate">{t.topico}</div>
                  <div className="text-sm text-slate-500 sm:truncate">
                    {t.disciplina}
                    {t.vencidasCaderno > 0 && ` · ${t.vencidasCaderno} no caderno para hoje`}
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <div className="sm:w-24 sm:text-right">
                    <span className="text-base text-slate-100 font-mono">{Math.round(t.taxa)}%</span>
                    <span className="text-sm text-slate-500"> · {t.acertos} de {t.total}</span>
                  </div>
                  <button type="button" onClick={() => onTreinarTopico(t.disciplina, t.topico)} className="px-4 py-2 sm:px-3.5 sm:py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium cursor-pointer">
                    Treinar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* Revisar */}
      <Secao titulo="O que revisar" subtitulo="Questões que você errou, na hora certa de rever.">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-base text-slate-300">
            <strong className="text-slate-100">{revisar.vencidasHoje}</strong> {revisar.vencidasHoje === 1 ? 'vencida' : 'vencidas'} hoje
            <span className="text-slate-500"> · {revisar.proximos7} nos próximos 7 dias</span>
            {revisar.reincidentes > 0 && <span className="text-slate-500"> · {revisar.reincidentes} {revisar.reincidentes === 1 ? 'reincidente' : 'reincidentes'} (erradas 2+ vezes)</span>}
          </div>
          {revisar.vencidasHoje > 0 && (
            <button type="button" onClick={revisarAgora} disabled={abrindoRevisao} className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white font-medium cursor-pointer">
              Revisar agora
            </button>
          )}
        </div>
        {revisar.porTopico.length > 0 && (
          <p className="text-sm text-slate-500">
            Mais acumuladas em: {revisar.porTopico.map((t) => `${t.topico} (${t.n})`).join(', ')}
          </p>
        )}
      </Secao>

      {/* Tirar o foco */}
      <Secao titulo="Pode tirar o foco" subtitulo="Dominados: 5 ou mais respostas, 85% ou mais de acerto e as 3 últimas certas. Só revise de vez em quando.">
        {dominados.length === 0 ? (
          <p className="text-slate-400">Nenhum tópico dominado ainda.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {dominados.map((t) => (
              <li key={t.disciplina + t.topico} className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-300 text-sm">
                {t.topico} <span className="text-emerald-400/60">{Math.round(t.taxa)}%</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {/* Por matéria */}
      <Secao titulo="Por matéria" subtitulo="Da mais fraca para a mais forte. Clique para ver os tópicos do edital.">
        <ul className="divide-y divide-white/[0.06]">
          {disciplinas.map((d) => {
            const aberto = aberta === d.disciplina;
            return (
              <li key={d.disciplina}>
                <button
                  type="button"
                  onClick={() => setAberta(aberto ? '' : d.disciplina)}
                  aria-expanded={aberto}
                  className="w-full py-4 flex items-center gap-3 sm:gap-4 text-left cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-base text-slate-100 sm:truncate">{d.disciplina}</div>
                    <div className="text-sm text-slate-500">
                      {d.total > 0 ? `${d.total} questões` : 'sem questões'} · {d.topicosPraticados}/{d.topicosTotal} tópicos praticados
                      {d.vencidasCaderno > 0 && ` · ${d.vencidasCaderno} revisões hoje`}
                    </div>
                  </div>
                  <div className="w-16 sm:w-48 shrink-0 space-y-1.5">
                    <div className="text-right text-base font-mono text-slate-100">{d.taxa === null ? '—' : `${Math.round(d.taxa)}%`}</div>
                    <Barra valor={d.taxa} />
                  </div>
                  <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
                </button>

                {aberto && (
                  <ul className="pb-4 pl-2 sm:pl-4 space-y-0.5">
                    {d.topicos.map((t) => {
                      const estado = ESTADOS[t.estado];
                      return (
                        <li key={t.topico} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 py-2 text-sm">
                          <span className="min-w-0 sm:flex-1 sm:truncate text-slate-300">{t.topico}</span>
                          <span className="flex items-center gap-3">
                            <span className={`sm:w-28 shrink-0 ${estado.cor}`}>{estado.rotulo}</span>
                            <span className="sm:w-24 shrink-0 sm:text-right font-mono text-slate-400">{t.total > 0 ? `${Math.round(t.taxa)}% · ${t.total}` : '—'}</span>
                            <button type="button" onClick={() => onTreinarTopico(d.disciplina, t.topico)} className="ml-auto sm:ml-0 shrink-0 py-1 text-indigo-300 hover:text-indigo-200 cursor-pointer">
                              Treinar
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </Secao>

      {/* Últimos 14 dias */}
      <Secao titulo="Últimos 14 dias" subtitulo="Altura = questões respondidas no dia; cor = aproveitamento.">
        <div className="flex items-end gap-1.5 h-28">
          {dias.map((d) => (
            <div key={d.dia} className="flex-1 flex flex-col items-center justify-end h-full" title={d.total ? `${d.dia.slice(8)}/${d.dia.slice(5, 7)}: ${d.total} questões, ${Math.round(d.taxa)}%` : `${d.dia.slice(8)}/${d.dia.slice(5, 7)}: sem estudo`}>
              <div className={`w-full rounded-sm ${d.total ? corDaTaxa(d.taxa) : 'bg-white/[0.05]'}`} style={{ height: d.total ? `${Math.max(8, (d.total / maiorDia) * 100)}%` : '4px' }} />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 text-xs text-slate-500">
          {dias.map((d) => <span key={d.dia} className="flex-1 text-center">{d.dia.slice(8)}</span>)}
        </div>
      </Secao>
    </div>
  );
}

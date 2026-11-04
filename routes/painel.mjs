import { montarPainel } from '../lib/painel.mjs';
import { hojeLocal } from '../lib/tempo.mjs';

// Painel de desempenho: o que atacar, o que revisar e o que já pode sair do foco
export function registrarRotasPainel(app, db) {
  app.get('/api/painel', (req, res) => {
    try {
      const respostas = db.prepare(`
        SELECT disciplina, COALESCE(NULLIF(topico, ''), assunto) AS topico, acertou, tempo_segundos, data_hora
        FROM questoes_respondidas ORDER BY data_hora ASC, id ASC
      `).all();
      const caderno = db.prepare(`
        SELECT disciplina, topico, status, data_proxima_revisao, total_tentativas, total_acertos FROM caderno_erros
      `).all();
      res.json(montarPainel({ respostas, caderno, hoje: hojeLocal() }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

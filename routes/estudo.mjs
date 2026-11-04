import { TOPICOS_EDITAL } from '../lib/taxonomia.mjs';
import { dataLocalISO } from '../lib/tempo.mjs';

export const TIPOS_ARMADILHA = [
  'Palavra absoluta (sempre/nunca/somente)',
  'Literalidade da lei',
  'Troca de conceito',
  'Interpretação do enunciado',
  'Não sabia o conteúdo',
  'Desatenção',
  'Cálculo'
];

const META_PADRAO = 20;

function lerConfig(db, chave) {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
  return row ? row.valor : '';
}

function gravarConfig(db, chave, valor) {
  db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(chave, valor);
}

// Dias entre hoje (local) e a data da prova (AAAA-MM-DD); negativo se já passou
export function diasAte(dataProva, hoje = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataProva || '')) return null;
  const [a, m, d] = dataProva.split('-').map(Number);
  const alvo = Date.UTC(a, m - 1, d);
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - base) / 86400000);
}

// Dias consecutivos (até hoje, ou até ontem se hoje ainda não teve estudo) com ao menos uma questão respondida
export function calcularSequencia(diasComEstudo, hoje = new Date()) {
  const set = new Set(diasComEstudo);
  const cursor = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  if (!set.has(dataLocalISO(cursor))) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (set.has(dataLocalISO(cursor))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export function registrarRotasEstudo(app, db) {
  // Anotação livre e tipo de armadilha de um item do Caderno de Erros
  app.patch('/api/caderno-erros/:id/notas', (req, res) => {
    try {
      const id = Number(req.params.id);
      const { anotacao, tipo_armadilha } = req.body || {};
      if (!db.prepare('SELECT id FROM caderno_erros WHERE id = ?').get(id)) {
        return res.status(404).json({ error: 'Item não encontrado.' });
      }
      if (tipo_armadilha && !TIPOS_ARMADILHA.includes(tipo_armadilha)) {
        return res.status(400).json({ error: 'Tipo de armadilha inválido.' });
      }
      db.prepare('UPDATE caderno_erros SET anotacao = ?, tipo_armadilha = ? WHERE id = ?')
        .run(String(anotacao || '').slice(0, 2000), tipo_armadilha || null, id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Plano de estudo: contagem regressiva, meta diária, sequência e cobertura do edital
  app.get('/api/plano', (req, res) => {
    try {
      const dataProva = lerConfig(db, 'data_prova');
      const metaDiaria = Number(lerConfig(db, 'meta_diaria')) || META_PADRAO;

      const agora = new Date();
      const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).toISOString();
      const respondidasHoje = db.prepare('SELECT COUNT(*) n FROM questoes_respondidas WHERE data_hora >= ?').get(inicioHoje).n;

      const datas = db.prepare('SELECT data_hora FROM questoes_respondidas').all()
        .map((r) => dataLocalISO(new Date(r.data_hora)));
      const sequencia = calcularSequencia(datas, agora);

      const tocados = new Set(db.prepare(`
        SELECT DISTINCT disciplina || '|' || topico k FROM questoes_respondidas WHERE topico IS NOT NULL AND topico <> ''
      `).all().map((r) => r.k));
      const faltam = [];
      let totalTopicos = 0;
      for (const [disciplina, lista] of Object.entries(TOPICOS_EDITAL)) {
        for (const t of lista) {
          totalTopicos++;
          if (!tocados.has(`${disciplina}|${t.topico}`)) faltam.push({ disciplina, topico: t.topico });
        }
      }

      const armadilhas = db.prepare(`
        SELECT tipo_armadilha tipo, COUNT(*) total FROM caderno_erros
        WHERE tipo_armadilha IS NOT NULL GROUP BY tipo_armadilha ORDER BY total DESC
      `).all();

      const dias = diasAte(dataProva, agora);
      res.json({
        dataProva: dataProva || null,
        diasRestantes: dias,
        metaDiaria,
        respondidasHoje,
        sequencia,
        cobertura: { totalTopicos, topicosEstudados: totalTopicos - faltam.length, faltam },
        armadilhas,
        tiposArmadilha: TIPOS_ARMADILHA
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/plano', (req, res) => {
    try {
      const { dataProva, metaDiaria } = req.body || {};
      if (dataProva !== undefined) {
        if (dataProva !== '' && diasAte(dataProva) === null) return res.status(400).json({ error: 'Data inválida (use AAAA-MM-DD).' });
        gravarConfig(db, 'data_prova', dataProva);
      }
      if (metaDiaria !== undefined) {
        const meta = Math.round(Number(metaDiaria));
        if (!(meta >= 1 && meta <= 500)) return res.status(400).json({ error: 'Meta diária deve ficar entre 1 e 500.' });
        gravarConfig(db, 'meta_diaria', String(meta));
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

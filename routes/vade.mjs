// Navegação pelos dispositivos de uma fonte do Vade Mecum (leitura paginada, na ordem do texto)
export function registrarRotasVade(app, db) {
  app.get('/api/base/fonte', (req, res) => {
    try {
      const fonte = String(req.query.fonte || '').trim();
      if (!fonte) return res.status(400).json({ error: 'Informe a fonte.' });
      const limite = Math.max(1, Math.min(60, Number(req.query.limite) || 30));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const total = db.prepare('SELECT COUNT(*) n FROM base_conhecimento WHERE fonte = ?').get(fonte).n;
      const itens = db.prepare(`
        SELECT id, fonte, disciplina, topico, referencia, texto
        FROM base_conhecimento WHERE fonte = ? ORDER BY id ASC LIMIT ? OFFSET ?
      `).all(fonte, limite, offset);
      res.json({ total, itens });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

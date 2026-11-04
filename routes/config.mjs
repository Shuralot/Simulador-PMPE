// Chave da API Gemini guardada no SQLite local (servidor só escuta em 127.0.0.1)
export function registrarRotasConfig(app, db) {
  // Obter chave da API salva no SQLite
  app.get('/api/config/key', (req, res) => {
    try {
      const row = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'gemini_api_key'").get();
      res.json({ key: row ? row.valor : '' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Salvar chave da API permanentemente no SQLite
  app.post('/api/config/key', (req, res) => {
    try {
      const { key } = req.body;
      const stmt = db.prepare(`
        INSERT INTO configuracoes (chave, valor) VALUES ('gemini_api_key', ?)
        ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
      `);
      stmt.run(key ? key.trim() : '');
      res.json({ success: true, message: 'Chave gravada com sucesso no SQLite!' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

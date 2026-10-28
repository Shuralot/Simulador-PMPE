# 🛡️ Simulador PMPE • Banca Instituto AOCP

<div align="center">

![Concurso PMPE](https://img.shields.io/badge/Concurso-Soldado%20PMPE-blue?style=for-the-badge&logo=shield)
![Banca AOCP](https://img.shields.io/badge/Banca-Instituto%20AOCP-indigo?style=for-the-badge)
![Status Offline](https://img.shields.io/badge/Acervo%20Offline-150%2B%20Questões-emerald?style=for-the-badge)
![React](https://img.shields.io/badge/React%2019-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)
![Google Gemini](https://img.shields.io/badge/Gemini%20AI-Ready-8E75C2?style=for-the-badge&logo=google)

<p align="center">
  <strong>"Polícia Militar de Pernambuco: Nossa presença, sua segurança."</strong>
  <br />
  Plataforma completa de treino tático, simulados reais e repetição espaçada focada 100% no edital de Soldado da PMPE.
</p>

</div>

---

## 🎯 O que é este projeto? *(Para leigos e concurseiros)*

O **Simulador PMPE** é um aplicativo feito para quem está estudando para o concurso de **Soldado da Polícia Militar de Pernambuco**. 

Diferente de sites de questões genéricos, este sistema já vem **pronto para uso no seu computador**, com:
1. **Mais de 150 questões reais e saneadas** extraídas de provas oficiais da banca Instituto AOCP (PMPE 2024, PMDF 2023 e PC-GO 2022).
2. **Funciona 100% offline:** você não precisa de internet para treinar com o acervo base.
3. **Gerador de Questões Inéditas com IA:** se quiser questões novas de qualquer assunto específico (ex: *Artigo 5º*, *Crase*, *Nassau*), basta conectar sua chave gratuita do Google Gemini para gerar questões no estilo idêntico ao da prova.
4. **Caderno de Erros Inteligente:** usa o *Sistema Leitner* de repetição espaçada. Toda questão que você erra ou marca como dúvida vai automaticamente para revisão no momento certo, evitando o esquecimento.

---

## 🚀 Como Rodar o Projeto no Seu Computador (Passo a Passo)

Você só precisa ter o **[Node.js](https://nodejs.org/)** instalado no seu computador.

### 1. Baixar o projeto
Abra o terminal (PowerShell, CMD ou Git Bash) e clone o repositório:
```bash
git clone https://github.com/Shuralot/Simulador-PMPE.git
cd Simulador-PMPE
```

### 2. Instalar as dependências
Execute o comando abaixo para baixar os pacotes necessários:
```bash
npm install
```

### 3. Iniciar o simulador
Inicie o aplicativo com um único comando:
```bash
npm run dev
```

Pronto! O navegador abrirá automaticamente em **`http://localhost:5173`** e o banco de dados SQLite iniciará em segundo plano.

---

## ✨ Funcionalidades Principais

* **📚 Acervo Pronto de Questões:** Mais de 150 questões categorizadas por bloco e matéria do edital:
  * *Língua Portuguesa*
  * *História de Pernambuco*
  * *Raciocínio Lógico-Matemático*
  * *Informática*
  * *Direito Constitucional*
  * *Direitos Humanos e Legislação Extravagante*
* **🧠 Modo Estudo:** Responda questão por questão com feedback imediato, dica do examinador e fundamentação detalhada do gabarito oficial.
* **⏱️ Modo Simulado:** Simulação real do dia da prova, com cronômetro em tempo real e resultado consolidado apenas ao final.
* **📊 Painel de Desempenho (Dashboard):** Acompanhe seu aproveitamento percentual, tempo médio por questão (pacing para o limite de 3m30s da prova) e zonas críticas de conteúdo.
* **🗑️ Gerenciamento de Testes:** Fez um treino rápido só para testar e não quer que ele estrague suas estatísticas? Na aba *Desempenho ➔ Gerenciar Testes*, você pode apagar qualquer simulado individual com um clique, recalculando as métricas instantaneamente.
* **📄 Banco de Provas em PDF:** Permite subir novos cadernos de prova em PDF para o SQLite fatiar e vetorizar itens reais.

---

## 🔑 Como usar o Gerador com Inteligência Artificial? *(Opcional)*

O acervo local já funciona offline sem precisar de nada. Mas se você quiser gerar **questões inéditas infinitas**:
1. Obtenha uma chave gratuita no **[Google AI Studio](https://aistudio.google.com/)**.
2. Abra a aba **Opções** no simulador.
3. Cole sua chave de API e clique em **Salvar e Testar**.
4. Sua chave fica salva **apenas no seu próprio computador** (localStorage e SQLite local). **Nenhuma chave é enviada para a internet ou para o GitHub.**

---

## 🔒 Segurança e Privacidade

* **Zero Chaves no Repositório:** O arquivo `.gitignore` bloqueia qualquer arquivo confidencial (`.env`, logs, chaves de API).
* **Banco Local Incluído:** O arquivo `simulador.db` incluído contém apenas as questões, provas e estrutura do edital, permitindo que qualquer pessoa que clone o projeto já comece treinando imediatamente.

---

## 🛠️ Tecnologias Utilizadas

* **Frontend:** React 19, TailwindCSS v4, Lucide Icons, Canvas Confetti.
* **Build Tool:** Vite 8 (carregamento ultra-rápido).
* **Backend:** Node.js Express com `node:sqlite` nativo em modo WAL de alta performance.
* **Inteligência Artificial:** Google Gemini 3.8 Flash (com prompts de calibração pedagógica e anti-alucinação jurídica).

---

<div align="center">
  <sub>Desenvolvido com foco na aprovação no Concurso Soldado PMPE • Força e Honra 🇧🇷</sub>
</div>

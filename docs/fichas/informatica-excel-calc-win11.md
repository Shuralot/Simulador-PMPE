# Informática: Excel 2019 vs. LibreOffice Calc e Windows 11 (Padrão AOCP)

## Excel 2019 vs. LibreOffice Calc (Funções e Diferenças)

Nas provas da banca Instituto AOCP, tanto o Microsoft Excel 2019 (PT-BR) quanto o LibreOffice Calc usam ponto e vírgula (;) para separar argumentos dentro de funções e dois-pontos (:) para indicar intervalo contínuo (ex.: A1:A10), enquanto ponto e vírgula em referência indica células não adjacentes (ex.: A1;A5).

Principais funções cobradas:
- SOMA(intervalo): soma os valores numéricos do intervalo.
- MÉDIA(intervalo): calcula a média aritmética apenas das células com números (ignora texto e células vazias).
- SE(teste_lógico; valor_se_verdadeiro; valor_se_falso): retorna um valor se a condição for verdadeira e outro se for falsa.
- CONT.SE(intervalo; critério) no Excel e no Calc: conta quantas células atendem a um critério (ex.: =CONT.SE(A1:A10; ">7")).
- CONT.NÚM(intervalo) no Excel / CONT.NÚM(intervalo) no Calc: conta apenas células com números. Já CONT.VALORES(intervalo) conta células não vazias (inclusive texto).
- SOMASE(intervalo; critério; [intervalo_soma]): soma apenas as células que atendem ao critério. SOMASES(intervalo_soma; intervalo_crit1; crit1; ...) aceita múltiplos critérios (atenção à ordem inversa: em SOMASES, o intervalo de soma vem primeiro!).
- PROCV(valor_procurado; matriz_tabela; núm_índice_coluna; [procurar_intervalo]): busca verticalmente na primeira coluna da matriz_tabela. Se o 4º argumento for FALSO (ou 0), exige correspondência exata; se VERDADEIRO (ou 1), exige tabela ordenada de forma crescente para busca aproximada.
- Referências: relativa (A1 — muda ao copiar/arrastar), absoluta ($A$1 — trava coluna e linha com cifrão $) e mista ($A1 trava só a coluna; A$1 trava só a linha). Tecla F4 alterna entre os tipos de referência no Excel (Shift+F4 no Calc).
- Extensões padrão: Excel 2019 usa .xlsx (e .xlsm com macros); LibreOffice Calc usa .ods. Word 2019 usa .docx; LibreOffice Writer usa .odt. PowerPoint 2019 usa .pptx; LibreOffice Impress usa .odp.

## Windows 11 e Prompt de Comando (Atalhos e Recursos)

Atalhos essenciais do Windows 11:
- Win + E: abre o Explorador de Arquivos.
- Win + D: mostra/oculta a Área de Trabalho (minimiza todas as janelas).
- Win + L: bloqueia o computador.
- Win + V: abre o histórico da Área de Transferência.
- Win + Shift + S: abre a Ferramenta de Captura de Tela.
- Win + Tab: abre a Visão de Tarefas (áreas de trabalho virtuais).
- Ctrl + Shift + Esc: abre diretamente o Gerenciador de Tarefas.
- Alt + Tab: alterna entre janelas abertas.
- Shift + Delete: exclui o item permanentemente sem passar pela Lixeira.
- F2: renomeia arquivo ou pasta selecionada.

Comandos básicos do Prompt de Comando (CMD) no Windows:
- dir: lista arquivos e pastas do diretório atual.
- cd: muda de diretório (cd .. sobe um nível).
- mkdir (ou md): cria uma nova pasta.
- rmdir (ou rd): remove pasta vazia.
- copy / move / del: copia, move e apaga arquivos.
- cls: limpa a tela do prompt.
- ipconfig: exibe configurações de rede (IP, máscara, gateway).
- ping: testa conectividade com um host/IP usando ICMP.
- tracert: mostra a rota (saltos) até um destino.

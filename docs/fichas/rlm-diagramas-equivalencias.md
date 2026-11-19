# Raciocínio Lógico-Matemático: Diagramas Lógicos, Tabela-Verdade, Negações e Equivalências

## Diagramas Lógicos (Diagramas de Venn e Quantificadores)

Nos diagramas lógicos, representamos proposições categóricas por relações entre conjuntos:
- "Todo A é B" (universal afirmativa): o conjunto A está inteiramente contido dentro do conjunto B (A ⊂ B). Atenção: isso NÃO garante que todo B é A, nem que existe elemento em B fora de A (B pode ser igual a A). Se "Todo A é B" e "Todo B é C", então necessariamente "Todo A é C".
- "Nenhum A é B" (universal negativa): os conjuntos A e B são disjuntos, ou seja, sua interseção é vazia (A ∩ B = ∅). É simétrica: equivale a "Nenhum B é A".
- "Algum A é B" (particular afirmativa): existe pelo menos um elemento na interseção entre A e B (A ∩ B ≠ ∅). É simétrica: equivale a "Algum B é A" e a "Pelo menos um A é B" ou "Existe A que é B". Atenção em provas da AOCP: "Algum A é B" NÃO implica que "Algum A não é B" (pode ocorrer de todos os A serem B).
- "Algum A não é B" (particular negativa): existe pelo menos um elemento em A que está fora de B (A - B ≠ ∅). NÃO é simétrica (não equivale a "Algum B não é A").

Operações com 2 e 3 conjuntos (Princípio da Inclusão-Exclusão):
- Para 2 conjuntos: n(A ∪ B) = n(A) + n(B) - n(A ∩ B).
- Para 3 conjuntos: n(A ∪ B ∪ C) = n(A) + n(B) + n(C) - n(A ∩ B) - n(A ∩ C) - n(B ∩ C) + n(A ∩ B ∩ C).
- Dica prática de resolução: sempre preencha o diagrama de Venn de dentro para fora, começando pela interseção dos 3 conjuntos, depois as interseções dois a dois (subtraindo o centro já preenchido) e por último as regiões exclusivas de cada conjunto e o lado de fora (nenhum).

## Conectivos Lógicos e Tabela-Verdade

- Conjunção (p ∧ q, "p e q"): só é VERDADEIRA quando ambas (p e q) são verdadeiras. Se uma for falsa, tudo é falso.
- Disjunção Inclusiva (p ∨ q, "p ou q"): só é FALSA quando ambas (p e q) são falsas. Basta uma verdadeira para ser verdadeira.
- Disjunção Exclusiva (p ⊻ q, "ou p, ou q"): é VERDADEIRA quando os valores lógicos são DIFERENTES (uma V e outra F). É falsa quando ambas são iguais (V-V ou F-F).
- Condicional (p → q, "se p, então q"): só é FALSA no caso "Vera Fischer" (antecedente p VERDADEIRO e consequente q FALSO). Nos demais casos (V→V, F→V, F→F) é verdadeira. Termos equivalentes ao "se... então": "p implica q", "p é condição suficiente para q", "q é condição necessária para p", "todo p é q".
- Bicondicional (p ↔ q, "p se e somente se q"): é VERDADEIRA quando os valores lógicos são IGUAIS (ambas V ou ambas F). "p é condição necessária e suficiente para q".

Classificação de proposições compostas:
- Tautologia: última coluna da tabela-verdade é 100% Verdadeira (ex.: p ∨ ~p).
- Contradição: última coluna é 100% Falsa (ex.: p ∧ ~p).
- Contingência: mistura valores V e F.

## Negações Lógicas (Leis de De Morgan e Condicional)

- Negação da conjunção ~(p ∧ q): ~p ∨ ~q ("nega ambas e troca E por OU").
- Negação da disjunção ~(p ∨ q): ~p ∧ ~q ("nega ambas e troca OU por E").
- Negação da condicional ~(p → q): p ∧ ~q (regra do MANÉ: "MAntém a primeira E NEga a segunda"). Nunca use "se... então" para negar um "se... então"!
- Negação do "Todo A é B": "Algum A não é B" (ou "Pelo menos um A não é B" / "Existe A que não é B"). Nunca negue "Todo" com "Nenhum"!
- Negação do "Nenhum A é B": "Algum A é B" (ou "Pelo menos um A é B" / "Existe A que é B").

## Equivalências Lógicas

As duas equivalências mais cobradas pela banca Instituto AOCP para a condicional (p → q):
1. Contrapositiva: ~q → ~p ("inverte e nega ambas, mantendo o se... então").
2. Disjunção equivalente (regra do NEYMAR): ~p ∨ q ("NEga a primeira, troca por OU e MAntém a segunda").
Equivalência da bicondicional (p ↔ q): (p → q) ∧ (q → p).
Equivalência da disjunção exclusiva (p ⊻ q): (p ∨ q) ∧ ~(p ∧ q), e sua negação é a bicondicional (p ↔ q).

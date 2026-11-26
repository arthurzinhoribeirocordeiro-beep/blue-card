# Jujutsu Cards (protótipo)

Jogo de abrir pacotes de cartas com tema de Jujutsu Kaisen. É um arquivo só: abra `index.html` no navegador.

## Como funciona

- Você começa com **$150**.
- A **loja** é reabastecida a cada **30 segundos**. O pacote mais simples sempre volta; os raros aparecem pouco.

| Pacote | Preço | Aparece em | Chances |
|---|---|---|---|
| Grau 4 | $50 | 100% das reposições | B 80 · A 17 · S 2.7 · SS 0.28 · SS+ 0.02 |
| Grau 2 | $300 | 60% | B 55 · A 34 · S 9.5 · SS 1.4 · SS+ 0.1 |
| Grau 1 | $1.500 | 35% | B 25 · A 47 · S 24 · SS 3.6 · SS+ 0.4 |
| Grau Especial | $8.000 | 15% | A 40 · S 45 · SS 13.5 · SS+ 1.5 |
| Expansão de Domínio | $40.000 | 6% | S 50 · SS 44 · SS+ 6 |
| Rei das Maldições | $200.000 | 2% | SS 75 · SS+ 25 |

- Cada pacote dá 3 cartas. Cada carta também pode vir em uma variação: **✨ Dourada** (5% de chance, rende 3×) ou **⚡ Black Flash** (1% de chance, rende 6×).
- Cartas colocadas nos **pódios** geram dinheiro sem parar. É preciso clicar no pódio para coletar, até você comprar a **Coleta Automática** por $10K.
- Você começa com 4 pódios e pode chegar a 10. O primeiro pódio extra custa $500, e cada um depois custa 4× o anterior.
- Uma carta vendida vale 3× a renda por segundo dela.
- O progresso é salvo no navegador. Os pódios continuam rendendo enquanto você está fora, até 2 horas.

## Ranking de força (renda por segundo)

- **SS+ (Lendário):** Sukuna ($2000/s), Gojo ($1850/s)
- **SS (Épico):** Yuta, Kenjaku, Yuji (despertado), Toji, Yuki, Geto, Mahoraga, Kashimo ($300–195/s)
- **S (Super Raro):** Maki, Megumi, Hakari, Jogo, Mahito, Todo, Choso, Higuruma, Uraume, Ishigori, Hanami ($60–30/s)
- **A (Raro):** Nanami, Naoya, Mei Mei, Naobito, Kusakabe, Dagon, Yaga, Gakuganji, Panda, Inumaki, Kamo, Miguel, Nobara ($12–6/s)
- **B (Comum):** Mai, Momo, Mechamaru, Miwa, Utahime, Ino, Junpei, Nitta, Shoko, Ijichi, Maldição Grau 4 ($3–1/s)

## Imagens dos personagens

As cartas usam emojis por padrão. Para colocar imagens, use um destes jeitos:
- salve os arquivos em `jujutsu-cards/img/<id>.png` (por exemplo `img/gojo.png` ou `img/sukuna.png`). Os ids estão na lista `CHARS` dentro do `index.html`;
- ou cole links no objeto `IMAGENS`, no começo do script.

Para mudar o equilíbrio do jogo, edite as constantes no começo do script: `PACKS`, `CHARS`, `RESTOCK_MS`, `VARS` e `podCost`.

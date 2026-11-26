# Jujutsu Cards (protótipo)

Jogo de abrir pacotes de cartas com tema de Jujutsu Kaisen. O jogo foi feito pensando primeiro no **celular**. É um arquivo só: abra `index.html` no navegador.

## Feito para celular

- **Abas na parte de baixo da tela:** Base, Loja, Cartas e Coleção. Ficam no alcance do polegar e mostram avisos, como um pacote raro em estoque ou cartas novas.
- **Painéis que sobem de baixo** para ver uma carta, trocar a carta de um pódio, vender e mexer nas configurações. Para fechar, arraste o painel pra baixo ou toque fora dele.
- **Abertura de pacote com muito impacto:**
  - O pacote cai do alto da tela e você toca 3 vezes pra rasgar. A cada toque ele treme mais, racha e solta luz na cor da melhor carta que tem dentro. No terceiro toque ele explode em partículas e a tela treme.
  - As cartas vêm da mais fraca pra mais forte, então a melhor fica sempre por último.
  - Carta rara (S pra cima, Dourada ou Black Flash) dá suspense antes de virar: a carta treme, brilha e um som vai subindo. Quando vira, sai uma explosão de partículas com raios girando atrás e o texto "SUPER RARO!", "ÉPICO!!" ou "LENDÁRIO!!!" bate na tela. A renda sobe contando até o valor.
  - ⚡ Black Flash solta raios vermelhos e ✨ Dourada solta chuva de moedas. Uma carta SS+ ativa a Expansão de Domínio com chuva de confete.
  - No fim aparece um resumo com 👑 na melhor carta, o total de renda nova subindo na tela e o botão "Abrir outro" pulsando.
  - Comprar e coletar dinheiro soltam moedas e fazem som de caixa registradora. Os botões verdes e roxos afundam quando você toca, como botões de jogo.
- **Barra fixa na Base** com os botões "Organizar" e "Coletar $X".
- **Botões grandes**, sem zoom ao tocar duas vezes, respeita o notch e a barra do iPhone e **vibra** quando você tira uma carta rara (no Android).
- **Dá pra instalar como app:** no menu do navegador, toque em "Adicionar à tela inicial" e o jogo abre em tela cheia.
- No computador, o jogo aparece centralizado, no formato de um celular.

## Mais coisas pra fazer

- **🎁 Pacote grátis a cada 4 minutos:** vem um Grau 4 (70%), um Grau 2 (25%) ou um Grau 1 (5%). Fica na Loja e um aviso aparece quando estiver pronto.
- **🔥 Fusão:** junte 3 cartas iguais (mesmo personagem, mesma variação e mesmas estrelas) pra ganhar uma estrela.
  - Renda por estrela: ★ ×2.5 · ★★ ×6 · ★★★ ×15 · ★★★★ ×35 · ★★★★★ ×80.
  - O botão "Fundir tudo" faz todas as fusões possíveis de uma vez, inclusive em cadeia.
  - A carta que está no pódio é a que fica, e os pódios vazios são preenchidos sozinhos.
  - A fusão tem uma animação própria.
- **🎯 Garantia SS:** se passar 20 pacotes sem tirar uma SS, a última carta do pacote seguinte vem SS ou SS+.
- **🍀 Sorte Dobrada:** em cada reposição tem 8% de chance de começar esse evento. Durante 60 segundos, as chances de S, SS e SS+ e das variações ✨/⚡ ficam em dobro.
- **🎯 Missões:** são sempre 3 ao mesmo tempo, como abrir pacotes, ganhar dinheiro, tirar cartas raras, fundir, vender ou descobrir personagens. Cada uma dá dinheiro e XP. Quando você completa uma, vem outra mais difícil e que paga mais.
- **⭐ Nível do jogador:** você ganha XP abrindo pacotes (os mais caros dão mais XP), completando missões e fazendo fusões. Cada nível dá dinheiro e tem uma comemoração. A cada 5 níveis você ganha um pacote grátis na hora.

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

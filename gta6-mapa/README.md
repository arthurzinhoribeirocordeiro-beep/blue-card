# 🗺️ Mapa de Coletáveis (app Android)

Um mapa de coletáveis para usar no celular enquanto você joga no PS5:

- **O filtro funciona como nos mapas interativos.** Você mostra e esconde categorias, tem *Mostrar todos* e *Esconder todos*, e pode esconder os que já pegou.
- **Marcar é um toque só.** Com o **⚡ Toque rápido** ligado, tocou no ícone, marcou. Se errar, toque em *Desfazer*.
- **Ele confere com a PSN.** O app lê seus troféus e avisa quando o contador de um coletável sobe no PS5, tipo "PSN: +1 em Pacotes (7/15)".
- **Tudo fica no celular.** Não precisa de PC nem de servidor.

## 📲 Instalar

1. No celular, abra a página de **Releases** do repositório no GitHub e baixe o **MapaColetaveis.apk** da versão mais nova.
   O link direto para a última versão é este (abra logado no GitHub, se o repositório for privado):
   `https://github.com/arthurzinhoribeirocordeiro-beep/blue-card/releases/latest/download/MapaColetaveis.apk`
2. Toque no arquivo baixado para instalar.
3. Se o Android avisar sobre **"fontes desconhecidas"**, toque em *Configurações* e permita a instalação para o navegador ou app que você usou para baixar. Depois volte e instale.

**Atualizar:** baixe o APK novo e instale por cima. Seu progresso continua lá.
Só **desinstalar** o app apaga os dados. Antes de desinstalar, faça um backup em ⚙️ Mais → *Fazer backup*.

> O APK é gerado automaticamente pelo GitHub (Actions) toda vez que algo nesta pasta muda.

## Como usar

| Na barra de baixo | O que faz |
|---|---|
| 🗺️ **Mapa** | O mapa. Pinça para dar zoom. |
| 🎛️ **Filtros** | Toque numa categoria para mostrar ou esconder. *Mostrar todos* e *Esconder todos* agem em tudo, e "esconder grupo" esconde o grupo inteiro. *Esconder os que já peguei* tira do mapa o que você já marcou. |
| 📋 **Lista** | Todos os coletáveis em lista, com busca e caixinha para marcar. Tocar no nome leva até ele no mapa. |
| 🎮 **PSN** | Conecta sua conta e liga cada categoria ao troféu dela. |
| ⚙️ **Mais** | Modo edição, imagem do mapa, categorias, importar e compartilhar listas, backup. |

- **⚡ Toque rápido ligado:** tocou no ícone, marcou. Segure o dedo no ícone para ver os detalhes.
- **⚡ Toque rápido desligado:** tocar abre os detalhes, com um botão grande **✓ PEGUEI**.
- Quando tem algum filtro ativo, aparece um aviso amarelo no topo. Toque nele para mostrar tudo de novo.
- O botão **voltar** do Android fecha o que estiver aberto.

## Montar o mapa

- **Imagem do mapa:** em ⚙️ Mais → *Colocar a imagem do mapa*, escolha um print ou imagem da galeria. As posições são guardadas em proporção, então trocar depois por uma imagem melhor do mesmo mapa não bagunça nada.
- **Coletáveis:** em ⚙️ Mais → *Modo edição*, toque no mapa onde fica cada um. Segure e arraste para mover.
- **Lista pronta:** em ⚙️ Mais → *Importar lista de coletáveis* (arquivo `.json`, formato abaixo).
- **Para testar:** use *Carregar o exemplo fictício*.

## 🎮 Conectar a PSN

1. Na aba **PSN**, toque no link do site da PlayStation e faça login.
2. Toque no segundo link (`ca.account.sony.com/api/v1/ssocookie`). Vai aparecer `{"npsso":"..."}`.
3. Copie tudo, volte para o app, cole e toque em **Conectar**.
4. Escolha o jogo. Os que têm "Grand Theft Auto" no nome aparecem primeiro.
5. Em cada categoria, escolha o troféu dela. O **★** indica que o número do troféu bate com o do seu mapa.

Com o app aberto, ele sincroniza a cada 2 minutos e também quando você volta para o app. Os avisos são estes:

- **"PSN: +1 em X"**: o botão **Ver** mostra só os que faltam daquela categoria, aí é só tocar no que você pegou.
- **"Falta marcar N"**: a PSN conta mais do que você marcou.
- **"Troféu conquistado!"**: tem um botão para marcar todos de uma vez.

> ⚠️ **O que a PSN consegue e não consegue informar:** a Sony só diz **quantos** coletáveis você pegou (e só nos troféus com contador, tipo 7/15), não **quais**. Nenhum app consegue ler a posição dentro do jogo no PS5.

🔒 O código NPSSO dá acesso à sua conta. **Não mande para ninguém.** Ele fica guardado só no app, no seu celular. A conexão usa os mesmos endereços da biblioteca não oficial [psn-api](https://github.com/achievements-app/psn-api). Quando o código expirar (de tempos em tempos), o app avisa e é só colar um novo.

Para testar sem conta, use **"Testar com uma PSN simulada"**. Nela os contadores sobem 1 por minuto.

## Formato da lista de coletáveis (`.json`)

```json
{
  "nome": "GTA 6 - Coletáveis",
  "grupos": [{ "id": "colecionaveis", "nome": "Coletáveis" }],
  "categorias": [
    { "id": "pacotes", "nome": "Pacotes escondidos", "icone": "📦", "cor": "#af7ac5", "grupo": "colecionaveis" }
  ],
  "itens": [
    { "id": "pacotes-1", "categoria": "pacotes", "x": 0.4213, "y": 0.3377, "nome": "Pacote 1", "descricao": "Embaixo do píer" }
  ]
}
```

`x` e `y` vão de 0 a 1, contados a partir do canto **superior esquerdo** da imagem do mapa. Mantenha os `id` iguais quando atualizar uma lista: assim o progresso continua valendo.

---

## Para quem for mexer no código

- `www/`: o app (HTML, CSS e JS puros, com o mapa feito em [Leaflet](https://leafletjs.com)).
  - `app.js`: telas, filtros e marcação
  - `psn.js`: conexão com a PSN
  - `armazenamento.js`: dados salvos no celular (IndexedDB)
- `android/`: projeto Android gerado pelo [Capacitor](https://capacitorjs.com).
- `../.github/workflows/apk-mapa-coletaveis.yml`: monta e publica o APK.

Para testar no navegador do PC, rode `npm install` e depois `npm run testar`, e abra `http://localhost:5173`. No navegador funciona tudo, menos a PSN real.
Para montar o APK no seu PC (precisa do Android Studio), rode `npm run android` e depois `cd android && ./gradlew assembleRelease`.

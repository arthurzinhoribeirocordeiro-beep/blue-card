# 🗺️ Mapa de Coletáveis

É um mapa de coletáveis igual aos mapas interativos que o pessoal usa, com três diferenças:

- **Marcar é um toque só.** Com o **Toque rápido** ligado, você toca no ícone e ele já fica marcado como pego. Se errar, aperta **Desfazer** no aviso que aparece.
- **Ele confere com a sua PSN.** O app lê seus troféus e avisa quando o contador de um coletável sobe no PS5, tipo "PSN: +1 em Pacotes (7/15)". Também avisa se você esqueceu de marcar algum.
- **Celular e PC ficam iguais.** O programa roda no seu PC e você abre no celular pelo Wi-Fi. O que você marca num aparece no outro.

> ⚠️ **O que a PSN consegue e não consegue informar:** a Sony só diz **quantos** coletáveis você pegou, e só quando o troféu tem contador (tipo 7/15). Ela não diz **quais** foram. Por isso o app avisa que o número subiu, mostra só os que faltam daquela categoria, e você toca no que pegou. Nenhum app de fora consegue ler a posição exata dentro do jogo no PS5.

---

## 1. Instalar (só uma vez)

1. Instale o **Node.js** (versão LTS): https://nodejs.org
2. Baixe esta pasta `gta6-mapa` para o seu PC.

## 2. Abrir

- **Windows:** dê dois cliques em `iniciar.bat`.
- **Mac/Linux:** abra o terminal na pasta e rode `npm install` (só na primeira vez) e depois `npm start`.

Vai aparecer algo assim:

```
  No PC:       http://localhost:5173
  No celular:  http://192.168.0.15:5173   (mesmo Wi-Fi)
```

Abra o endereço "No celular" no navegador do celular. Dica: use **"Adicionar à tela inicial"** e ele vira um ícone, igual um app.

> Se o celular não abrir: na primeira vez o Windows pergunta se o Node.js pode usar a rede. Marque **Redes privadas** e permita.

Para testar sem PSN, use `npm run demo`. Aí a PSN fica simulada e os contadores sobem sozinhos, 1 por minuto.

## 3. Montar o mapa

Na primeira vez o app pergunta como você quer começar:

- **Ver um exemplo**: coletáveis inventados, só para testar.
- **Importar uma lista** (`.json`): quando sair uma lista da comunidade, é só converter para o formato abaixo.
- **Montar do zero**: você liga o **modo edição** e toca no mapa onde fica cada coletável.

**Imagem do mapa:** em ⚙ Configurações → *Enviar a imagem do mapa*. Pode ser JPG, PNG ou WEBP. As posições são guardadas em proporção, então você pode trocar a imagem depois por uma de resolução maior sem bagunçar nada.

**Categorias:** em ⚙ Configurações você cria e edita categorias com nome, emoji, cor e grupo. O grupo é o título que aparece no filtro, tipo "Coletáveis" ou "Atividades".

## 4. Usar no dia a dia

| Onde | O que faz |
|---|---|
| **Filtros** | Toque numa categoria para mostrar ou esconder. *Mostrar todos* e *Esconder todos* agem em tudo, e o título do grupo esconde ou mostra o grupo inteiro. *Esconder os que já peguei* tira do mapa o que você já marcou. |
| **⚡ Toque rápido** | **Ligado:** tocou no ícone, marcou (segure o dedo para ver os detalhes). **Desligado:** tocar abre os detalhes com um botão grande **✓ PEGUEI**. |
| **Lista** | Todos os coletáveis em lista, com busca e caixinha para marcar. Tocar no nome leva até ele no mapa. |
| **PSN** | Liga sua conta, escolhe o jogo e conecta cada categoria ao troféu dela. |

## 5. Conectar a PSN

1. No navegador, entre em **playstation.com** e faça login.
2. Na mesma aba, abra **https://ca.account.sony.com/api/v1/ssocookie**.
3. Copie o que aparecer (`{"npsso":"..."}`) e cole na aba **PSN** do app.
4. Escolha o jogo. Os que têm "Grand Theft Auto" no nome aparecem primeiro.
5. Em cada categoria, escolha o troféu correspondente. O **★** indica que o número do troféu bate com o número de itens do seu mapa.

A partir daí, com o app aberto, ele sincroniza a cada 2 minutos e avisa:

- **"PSN: +1 em X"**: você pegou um. O botão **Ver** mostra só os que faltam daquela categoria.
- **"Falta marcar N"**: a PSN conta mais do que você marcou.
- **"Troféu conquistado!"**: tem um botão para marcar todos de uma vez.

🔒 **O código NPSSO dá acesso à sua conta. Não mande para ninguém.** Ele fica salvo só no seu PC, em `dados/.psn-token`, e é usado só para ler troféus. Ele expira de tempos em tempos: quando isso acontecer, é só repetir os passos acima. A conexão usa a biblioteca não oficial [psn-api](https://github.com/achievements-app/psn-api), a mesma usada por sites de troféus.

## Onde ficam os dados

Tudo fica na pasta `dados/`:

- `mapa.json`: categorias e coletáveis
- `progresso.json`: o que você já pegou e os troféus ligados
- `mapa.jpg` (ou png/webp): a imagem do mapa
- `.psn-token`: seu código da PSN

Em ⚙ Configurações também dá para **exportar a lista** (para mandar para um amigo) e **baixar um backup completo**.

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

`x` e `y` vão de 0 a 1, contados a partir do canto **superior esquerdo** da imagem do mapa (0,0 é o canto de cima à esquerda e 1,1 é o de baixo à direita). Mantenha os `id` iguais quando atualizar a lista: assim o seu progresso continua valendo.

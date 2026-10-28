# Fork: ports para PC e saves na nuvem própria

Estado do trabalho no branch `feat/self-hosted-cloud-saves` do fork
[TheusSales/hydra](https://github.com/TheusSales/hydra) e o que falta fazer.
Última atualização: 28/10/2026.

## O que já existe

| Commit      | O que faz                                                                                                                                                                                                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `38b2047d4` | Cloud save em qualquer remoto rclone (SFTP numa VPS, Google Drive, S3, WebDAV…), sem conta nem assinatura do Hydra. Configuração em **Configurações → Integrações → Saves na sua própria nuvem**.                                                                                   |
| `1e44f7355` | Catálogo de ports em **Configurações → Ports para PC**. Primeiro jogo: God of War III Remastered pelo [SpartanPort](https://github.com/FelipePrado0/SpartanPort). Instala da release oficial, valida a pasta do jogo pelo `param.sfo`, adiciona à biblioteca e sincroniza os saves. |
| `831b19566` | Versão Windows do port (zip), atualização sem sobrescrever o jogo aberto e saves compartilhados entre Windows e Linux.                                                                                                                                                              |

### Onde está o código

- `src/main/services/cloud-save/remote/` — backend de nuvem (interface, store
  de snapshots, servidor WebDAV local do rclone).
- `src/main/services/cloud-save/local-user-id.ts` — escopo `self-hosted` do
  estado local do cloud save quando não há conta Hydra.
- `src/main/services/ports/` — catálogo (`catalog.ts`), instalador e
  integração com a biblioteca (`pc-ports.ts`), validação do dump
  (`port-game-data.ts`), helpers puros (`port-runtime.ts`).
- `src/renderer/src/pages/settings/pc-ports/` e
  `src/renderer/src/pages/settings/settings-self-hosted-cloud-saves.tsx` — telas.

### Como funciona, em uma linha cada

- **Saves:** o Hydra conversa com um `rclone serve webdav` em `127.0.0.1`
  (token aleatório na URL). Layout no remoto: `blobs/<sha256>` e
  `games/<loja>/<hex(objectId)>.json`.
- **Ports:** jogo `custom` com `objectId` fixo `port-<id>` e
  `platform = "PC Port"`; executável igual ao AppImage/exe do port; opções
  `SPARTAN_DATA_DIR=<pasta> %command% --play`. A pasta de saves
  (`<dados>/user/savedata`) é registrada como caminho customizado portátil.

## O que já foi testado

- Ponta a ponta contra a VPS (`vps:hydra-saves`), pelo app isolado: instalar o
  SpartanPort, configurar com o dump real (CUSA01715 + atualização v1.02),
  enviar um save de teste, apagar localmente e restaurar com o mesmo hash.
- 526 testes de cloud save, ports e shared passando; typecheck e lint limpos.

## Próximos passos

1. **Jogar de verdade pelo fork.** Abrir o God of War III pela biblioteca,
   salvar no jogo, fechar e sincronizar. Ainda não foi feito: confirma o
   lançamento com `--play` e a descoberta de saves reais.
2. **Testar no Windows.** Instalar o port (zip), abrir o jogo e sincronizar.
   Depois, restaurar no Linux o save feito no Windows (e o contrário) para
   validar a adoção de caminhos entre sistemas.
3. **Saves bloqueados para a nuvem do Hydra.** Ports só funcionam com o
   backend próprio; com a nuvem oficial, a API deles provavelmente recusa
   jogos `custom`. Esconder ou explicar isso na tela.
4. **Coleta de lixo dos blobs.** Apagar o save de um jogo remove só o
   snapshot; os arquivos em `blobs/` ficam. Criar uma limpeza de blobs sem
   referência.
5. **Mais jogos no catálogo.** Candidatos com saves bem definidos:
   Zelda64Recomp, UnleashedRecomp, Ship of Harkinian, 2 Ship 2 Harkinian,
   bloodborne_pc. Cada um precisa de uma entrada em `catalog.ts` (assets,
   validação do jogo, variável/argumentos de lançamento, pastas de saves).
6. **Troféus.** O SpartanPort grava `user/trophies.dat`; dá para sincronizar
   como arquivo junto com os saves.
7. **Opcional: Proton.** Rodar o build Windows do port pelo Proton no Linux,
   se algum dia o AppImage não servir.
8. **Abrir um PR** do branch para a `main` do fork quando os itens 1 e 2
   estiverem validados.

## Retomando em outro computador

```bash
git clone https://github.com/TheusSales/hydra.git
cd hydra
git switch feat/self-hosted-cloud-saves
git remote add upstream https://github.com/hydralauncher/hydra.git
```

Dependências (precisa de Node, Rust/cargo e 7-Zip conforme o README do Hydra):

```bash
npx yarn@1.22.22 install --frozen-lockfile
cp .env.example .env
```

O pre-commit e o pre-push chamam `yarn`; se ele não estiver instalado
globalmente, instale (`npm i -g yarn@1.22.22`) ou use um atalho que chame
`npx yarn@1.22.22`.

**rclone e VPS.** Instale o rclone e crie o remoto `vps` (SFTP), usando o
mesmo host, usuário e chave SSH com que você já entra na VPS:

```bash
rclone config create vps sftp host=<host-da-vps> user=<usuario> key_file=$HOME/.ssh/<sua-chave> known_hosts_file=$HOME/.ssh/known_hosts host_key_algorithms=ssh-ed25519
```

A chave precisa existir no outro computador (copie a atual ou autorize uma
nova na VPS), e o host precisa estar no `known_hosts` (entre uma vez com
`ssh`). O `host_key_algorithms=ssh-ed25519` evita o erro
`knownhosts: key mismatch` do rclone. Teste com `rclone lsd vps:`.

**Rodar o fork sem mexer no Hydra instalado** (pasta de dados separada):

```bash
npx electron-vite dev -- --user-data-dir=$HOME/.config/hydralauncher-fork-dev
```

Para automatizar testes pela janela, adicione `--remoteDebuggingPort 9223`
antes do `--` e chame `window.electron.*` pelo protocolo do DevTools.

**Gerar e instalar o build do fork (Linux)**, lado a lado com o Hydra oficial.
Com `MAIN_VITE_FORK_BUILD=true` o app não se atualiza para a versão oficial,
deixa os links `hydralauncher://` com o oficial e usa a pasta
`~/.config/hydralauncher-fork` (`%APPDATA%\hydralauncher-fork` no Windows).

`.env` do build:

```bash
MAIN_VITE_API_URL=https://hydra-api-us-east-1.losbroxas.org
MAIN_VITE_AUTH_URL=https://auth.hydra.losbroxas.org
MAIN_VITE_CHECKOUT_URL=https://checkout.hydralauncher.gg
# Vazio de propósito: definido, o app empacotado carrega a interface
# remota oficial em vez da interface do fork.
MAIN_VITE_LAUNCHER_SUBDOMAIN=
MAIN_VITE_FORK_BUILD=true
```

O empacotamento compila um `epic-prerequisite-runner.exe` (Rust para
Windows), que exige `rust-mingw` e `mingw-w64-gcc`. Sem eles, dá para
reaproveitar o do Hydra oficial instalado quando o código-fonte do runner for
o mesmo (o script confere o hash):

```bash
~/.local/bin/hydra.AppImage --appimage-extract 'resources/epic/*'
mkdir -p binaries/epic-prerequisite-runner/x64
cp squashfs-root/resources/epic/epic-prerequisite-runner.exe squashfs-root/resources/epic/.build.json binaries/epic-prerequisite-runner/x64/
```

Build e instalação (só AppImage; `rpm`/`deb` exigem ferramentas extras):

```bash
npx yarn@1.22.22 build:native
npx electron-vite build
npx electron-builder --linux AppImage
install -m 755 dist/hydralauncher-*.AppImage ~/.local/bin/hydra-fork.AppImage
```

Crie também um atalho `~/.local/share/applications/hydra-fork.desktop`
apontando para `~/.local/bin/hydra-fork.AppImage`.

**Testes:**

```bash
node --import ./scripts/register-ts-node.mjs --test "src/main/services/cloud-save/**/*.test.ts" "src/main/services/ports/*.test.ts" "src/shared/*.test.ts"
```

O teste de integração do rclone (`rclone-webdav-server.test.ts`) é pulado se
o `rclone` não estiver no PATH.

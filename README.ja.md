[English](README.md) | 日本語

# scriptup

[![Release](https://img.shields.io/github/v/release/Nano191225/scriptup?display_name=tag)](https://github.com/Nano191225/scriptup/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

Minecraft Bedrock ScriptAPI 開発向けの CLI です。

scriptup は、@minecraft/\* の更新、ScriptAPI での外部ライブラリ利用、そして ScriptAPI 用ライブラリ作成の初期構築を素早く行えるようにします。

## モチベーション

- @minecraft/\* の更新を容易にする
- ScriptAPI で簡単に外部ライブラリを使えるようにする
- ScriptAPI 用のライブラリを簡単に作れるようにする

## 主な機能

- manifest.json の ScriptAPI 依存バージョン更新と、対応 npm パッケージのインストール
- development_behavior_packs 直下への新規プロジェクト作成
- 現在のディレクトリを ScriptAPI プロジェクトとして初期化
- manifest.json の script entry を出力先として tsdown ビルド
- 再利用可能ライブラリ作成向けのローカル雛形生成

## 動作要件

- Node.js 18 以上
- アドオンを試すための Minecraft Bedrock 実行環境
- npm, pnpm, yarn, bun のいずれか

## インストール

好みのパッケージマネージャーで global インストールしてください。

```bash
npm i -g @nano191225/scriptup
```

```bash
pnpm add -g @nano191225/scriptup
```

導入後は scriptup（または sup）で実行できます。

## クイックスタート

### 最新 stable の ScriptAPI モジュールへ更新

```bash
scriptup stable
```

### 新規プロジェクト作成

```bash
scriptup new my-pack --open
```

### ビルド

```bash
scriptup build
```

## コマンド

### scriptup stable

最新の stable な Minecraft バージョンに一致するモジュールをインストールします。

### scriptup preview

最新の preview な Minecraft バージョンに一致するモジュールをインストールします。

### scriptup lts

LTS 相当（stable/preview/beta/internal 以外を優先）のモジュールをインストールします。見つからない場合は stable 相当にフォールバックします。

### scriptup <version>

手動バージョン検索モードです。

例:

```bash
scriptup 1.21.60
scriptup 2.0.0-beta
```

### scriptup init

現在のディレクトリを ScriptAPI プロジェクトとして初期化します。

オプション:

- --no-workflow: GitHub Actions workflow を生成しない

実行内容:

- 主要ファイルを生成（manifest.json, tsconfig.json, src/main.ts など）
- tsdown.config.ts がなければ作成
- package.json scripts を更新
    - build: scriptup build --release
    - watch: scriptup build --watch
- 必要な devDependencies をインストール

### scriptup new <project-name>

新しい ScriptAPI プロジェクトを作成します。

オプション:

- -o, --open [command]: 作成後にエディタで開く（既定値: code）
- -p, --preview: Minecraft Bedrock Preview の behavior packs ディレクトリを使う
- -d, --dir <path>: 指定ディレクトリ配下に作成
- --lib: package/ 配下にローカルライブラリ雛形を含める
- --no-link: --dir 使用時の behavior packs へのリンク作成を無効化
- --no-workflow: GitHub Actions workflow を生成しない

既定の作成先:

- Windows stable:
    - %APPDATA%/Minecraft Bedrock/Users/Shared/games/com.mojang/development_behavior_packs
- Windows preview:
    - %APPDATA%/Minecraft Bedrock Preview/Users/Shared/games/com.mojang/development_behavior_packs
- Linux (mcpelauncher):
    - ${XDG_DATA_HOME:-~/.local/share}/mcpelauncher/games/com.mojang/development_behavior_packs

### scriptup build

tsdown で現在の ScriptAPI プロジェクトをビルドします。

オプション:

- -b, --bundle: 強制的にバンドル出力
- -w, --watch: 監視モード
- -r, --release: リリースビルド（圧縮有効、sourcemap 無効）

ビルド挙動の要点:

- 出力先は manifest.json の script module entry から決定（例: scripts/main.js）
- 入力エントリの優先順位
    - src/main.ts
    - src/index.ts
    - tsdown.config.ts の entry
- release モードでは package/ が存在する場合に package/\*\*/\*.ts も dist/ へ追加ビルド

## 典型的な使い方

### 既存プロジェクト

```bash
scriptup init
scriptup stable
scriptup build
```

### 新規アドオン

```bash
scriptup new my-addon --open
cd my-addon
scriptup build --watch
```

### ライブラリ前提の新規プロジェクト

```bash
scriptup new @yourname/your-lib --lib --dir . --open
```

## 補足

- manifest.json の依存更新と devDependencies のインストールをあわせて実行します
- packageManager フィールドまたは lockfile からパッケージマネージャーを自動判定します
- エイリアスとして sup も使えます

## ライセンス

MIT

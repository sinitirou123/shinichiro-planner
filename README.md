# しんいちろう手帳 v15

未完了の作業予定・TODOを今日以降の空き時間へ自動で繰り越す週間手帳です。v14の色と画面構成を維持しています。

公開URL: https://sinitirou123.github.io/shinichiro-planner/

## 使い方

- 「週間」「今日」「メモ」「AIで組む」から操作します。
- 前日以前の未完了作業とTODOを、現在時刻より後の空き時間に移します。
- 配信・打ち合わせなどの固定予定、完了済みの項目、休憩は動かしません。
- 作業時間は9:00〜翌3:00。作業は元の長さ、TODOは25分です。5分休憩と3件ごとの30分自由時間も確保します。
- 60日先まで空きがなければ元の項目を保持します。過去の日付に繰り越し履歴が残り、再読み込みで重複しません。
- 新規予定は固定予定か作業タスクを選べます。
- 「AIで組む」には選んだ日の「決まっている予定」が表示され、開始・終了時刻を指定して追加できます。重なる未完了作業は休憩込みで空き時間へ移し、固定予定や完了済みの予定と重なる追加は止めます。

## 個人データと引き継ぎ

入力した予定・TODO・メモ・完了チェックは、その端末のブラウザ内に保存されます。サーバーへの送信や端末間の自動同期はありません。同じURLを使っていても別のブラウザでは別データです。

公開ソースには個人の初期予定やメモを含めていません。初めて開く端末では空の手帳になります。「バックアップ・端末の引き継ぎ」で元の端末からデータを表示・コピーし、新しい端末へ貼り付けて取り込めます。取り込みは置き換えですが、直前の内容に戻すボタンもあります。

ブラウザのサイトデータを消すと保存内容も消えます。必要に応じてバックアップをファイルに保存してください。

## 更新と公開

GitHub Pagesを利用し、mainブランチに変更を送るとGitHub Actionsがテストしてpublicフォルダを同じURLへ公開します。毎回のZIPアップロードは不要です。

GitHubの画面でpublic内のファイルを編集し「Commit changes」で保存しても自動公開されます。現時点ではブラウザからの更新が使えます。コマンドで送信する場合は、別途GitHubの認証が必要です。

1. public内のファイルを修正。
2. `node --test tests/scheduler.test.cjs` と `node --check public/planner-ui.js` を実行。
3. 変更をcommitし、`git push origin main`。
4. GitHubのActionsで「Publish planner」の完了を確認。

公開設定は Settings → Pages → Source: GitHub Actions です。

- public/index.html: 画面とスタイル
- public/planner-core.js: 日付・空き時間・繰り越し
- public/planner-ui.js: 操作・保存・バックアップ
- public/seed-data.js: 空の初期データ
- tests/scheduler.test.cjs: 自動配置と固定予定の追加の17件の検証
- .github/workflows/pages.yml: テストと自動公開
- netlify.toml と public/_headers: 将来Netlifyへ移す場合の設定（GitHub Pagesでは_headersは使いません）

原本や個人のバックアップJSONは公開リポジトリから除外しています。検索抑止用のrobots.txtはアクセス制限ではありません。

公式説明: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

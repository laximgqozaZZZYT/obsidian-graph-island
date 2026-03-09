# クエリ記法リファレンス

Novel Graph Views で使用できるクエリ記法の一覧です。
クエリは**検索バー**、**グループ分けルール**、**ノードルール**、**方向重力ルール**で共通して使えます。

---

## 基本構文

### フィールド指定: `field:value`

ノードの特定フィールドに対してマッチングします。

| フィールド   | 対象                           | 例                        |
|-------------|-------------------------------|--------------------------|
| `tag`       | タグ配列（いずれかに部分一致） | `tag:character`          |
| `category`  | カテゴリ（部分一致）           | `category:person`        |
| `path`      | ファイルパス（部分一致）       | `path:characters/`       |
| `id`        | ノードID（部分一致）           | `id:alice`               |
| `label`     | ラベル名（部分一致）           | `label:alice`            |

- すべてのマッチングは **大文字小文字を区別しない**（case-insensitive）
- デフォルトは **部分一致**（substring match）

### 裸の値（フィールド省略）

フィールドを省略すると `label` フィールドとして扱われます。

```
alice        → label:alice と同じ
"King Lear"  → label:"King Lear" と同じ
```

### 引用符

スペースを含む値は引用符で囲みます。

```
tag:"main character"
path:"stories/act 1/"
```

### ワイルドカード `*`

すべてのノードにマッチします。

```
*            → 全ノードにマッチ
tag:*        → グループ分けで「タグ別」を意味する特殊形式
category:*   → グループ分けで「ノードタイプ別」を意味する特殊形式
```

### 特殊キーワード `isTag`

仮想タグノード（タグ自体を表すノード）にマッチします。

```
isTag        → isTag:true と同じ
```

---

## ブール演算子

複数の条件を論理演算子で組み合わせられます。

| 演算子 | 意味                     | 例                                      |
|--------|--------------------------|----------------------------------------|
| `AND`  | 両方を満たす             | `tag:character AND category:person`    |
| `OR`   | いずれかを満たす         | `tag:character OR tag:location`        |
| `XOR`  | いずれか一方のみ満たす   | `tag:hero XOR tag:villain`             |
| `NOR`  | どちらも満たさない       | `tag:x NOR tag:y`                      |
| `NAND` | 両方は満たさない         | `tag:character NAND tag:protagonist`   |

### 演算子の優先順位

`AND` と `NAND` は `OR`、`XOR`、`NOR` より**高い優先度**を持ちます。

```
tag:a OR tag:b AND tag:c
→ tag:a OR (tag:b AND tag:c)    ← AND が先に結合
```

### 括弧

括弧で優先順位を明示的に制御できます。

```
(tag:a OR tag:b) AND tag:c     ← OR を先に評価
(tag:hero XOR tag:villain) AND category:person
```

---

## 検索バー専用: `hop:` フィルタ

検索バーでのみ使用可能な近傍探索フィルタです。

### 構文: `hop:name:n`

指定ノードから `n` ホップ以内のノードをハイライトします。

```
hop:arthur:2       → "arthur" を含むノードから 2ホップ以内
hop:merlin:3       → "merlin" を含むノードから 3ホップ以内
```

- `name` はラベルの部分一致（大文字小文字区別なし）
- 複数の hop フィルタをカンマ区切りで併用可能
- テキスト検索と混在も可能

```
hop:arthur:2, hop:merlin:1       → 両方の近傍を表示
hop:arthur:2, character          → arthur の近傍 + "character" を含むノード
```

---

## 使用箇所ごとの詳細

### 1. 検索バー

パネル上部の検索欄。ノードのハイライト/フィルタに使用。

```
tag:character                → character タグを持つノードをハイライト
tag:hero AND path:stories/   → 条件の組み合わせ
hop:arthur:3                 → arthur 近傍 3ホップ
*                            → 全ノード表示
```

### 2. グループ分けルール（commonQueries）

クラスター配置でのノード分割方法を定義。`tag:*` や `category:*` の特殊形式を使います。

| クエリ       | グループ分け基準 |
|-------------|-----------------|
| `tag:*`     | タグ別           |
| `category:*`| ノードタイプ別   |

各ルールに「再帰」トグルがあり、ON にするとグループ内を連結成分でさらに分割します。

複数ルールはパイプライン方式で適用されます:
```
ルール1: tag:*        → タグでグループ分け
ルール2: category:*   → さらにノードタイプで細分化
→ "character|person", "character|place", "location|person" ... のような複合グループが生成
```

### 3. ノードルール（nodeRules）

ノード個別の間隔・重力を制御。`query` フィールドに通常のクエリ記法を使用。

```json
[
  {
    "query": "*",
    "spacingMultiplier": 2.0,
    "gravityAngle": -1,
    "gravityStrength": 0
  },
  {
    "query": "tag:character",
    "spacingMultiplier": 0.5,
    "gravityAngle": 270,
    "gravityStrength": 0.2
  }
]
```

- `query`: 本ドキュメントのクエリ記法に従う
- `spacingMultiplier`: ノード間隔の倍率（0.1〜5.0）
- `gravityAngle`: 重力方向（度: 0=右, 90=下, 180=左, 270=上, -1=なし）
- `gravityStrength`: 重力強度（0〜1）

### 4. 方向重力ルール（directionalGravityRules）

特定ノード群に方向性のある重力を適用。`filter` フィールドに通常のクエリ記法を使用。

```json
[
  {
    "filter": "tag:character",
    "direction": "top",
    "strength": 0.1
  },
  {
    "filter": "tag:location",
    "direction": "bottom",
    "strength": 0.15
  }
]
```

- `filter`: 本ドキュメントのクエリ記法に従う
- `direction`: `"top"` | `"bottom"` | `"left"` | `"right"` またはラジアン値
- `strength`: 重力強度（0〜1）

### 5. グループプリセット（groupPresets）

色分けグループの条件定義。`expression` フィールドにブール式を AST 形式で記述。

```json
[
  {
    "condition": { "layout": "force" },
    "groups": [
      {
        "expression": { "type": "leaf", "field": "tag", "value": "character" },
        "color": "#ff6b6b"
      },
      {
        "expression": {
          "type": "branch", "op": "AND",
          "left": { "type": "leaf", "field": "tag", "value": "location" },
          "right": { "type": "leaf", "field": "category", "value": "city" }
        },
        "color": "#4ecdc4"
      }
    ]
  }
]
```

---

## クイックリファレンス

```
# フィールド指定
tag:character          タグに "character" を含むノード
category:person        カテゴリが "person" のノード
path:chapters/         パスに "chapters/" を含むノード
id:node123             IDに "node123" を含むノード
label:alice            ラベルに "alice" を含むノード
alice                  ↑ と同じ（label は省略可）

# 特殊
*                      全ノード
isTag                  仮想タグノード
tag:*                  グループ分け: タグ別
category:*             グループ分け: ノードタイプ別

# ブール演算
A AND B                A かつ B
A OR B                 A または B
A XOR B                A か B の一方のみ
A NOR B                A でも B でもない
A NAND B               A かつ B ではない
(A OR B) AND C         括弧で優先順位を制御

# 検索バー限定
hop:name:n             name から n ホップ以内
hop:arthur:2, merlin   hop とテキスト検索の混在
```

# 範例

這幾頁示範一個**完整**的付款流程，而不是零散的片段：預留付款、用戶回來後確認、結果未知時對帳、背景工作收尾。

所有範例共用同一個與框架無關的核心：[`examples/payment-service.ts`](https://github.com/enylin/line-pay-merchant/blob/main/examples/payment-service.ts)。它只依賴函式庫與一個很小的 `OrderStore` 介面，所以不論你用 Express、Next.js、NestJS 還是別的，變的只有「把結果翻成 HTTP 回應」那一層。核心有[測試](../guide/testing)，CI 也會對它做型別檢查；Express、Web 標準 handler 的範例只做型別檢查，沒有自己的測試；NestJS 與 Next.js 頁面上的程式碼是示意，沒有檢查。

## 訂單的狀態

付款流程是一個狀態機。把「進行中」寫成明確的狀態，是結果未知時還能收斂的關鍵：

| 狀態                | 意思                                           |
| ------------------- | ---------------------------------------------- |
| `created`           | 訂單建立了，還沒送到 LINE Pay。                |
| `awaiting-approval` | 已 `request`，用戶正在 LINE Pay 核准。         |
| `confirming`        | `confirm` 已送出，還沒有答案（或答案是未知）。 |
| `paid`              | 已付款。                                       |
| `needs-attention`   | 久久無法判斷，需要人到商家後台確認。           |

`OrderStore` 只要求一個特別的方法：`transition(id, when, to, patch)`。它必須是**原子的條件更新**（SQL 的 `UPDATE … WHERE status = ANY($status) AND ($claimId IS NULL OR claim_id = $claimId)`）。這是同時湧入兩個請求時，只讓一個去 `confirm` 的關鍵；`claimId` 則讓一個慢的請求不能把別人較新的搶佔還回去。

<<< @/../examples/shared/orders.ts{ts}

## 核心做了什麼

<<< @/../examples/payment-service.ts#start{ts}

<<< @/../examples/payment-service.ts#confirm{ts}

<<< @/../examples/payment-service.ts#failure{ts}

重點：

1. **先寫下，再送出。**搶佔訂單時同時存下 `ReconcileContext`，所以就算行程在拿到回應前被殺掉，事後還有東西可以對帳。
2. **金額來自訂單**（`claimed.total`），不是網址。
3. **失敗分三條路**：結果未知（連「對帳回 `not-applied`」也算）→ 訂單留在 `confirming`，由背景工作稍後再看一次；確定沒生效（沒送出、被拒絕）→ 還給用戶，而且只有持有這次搶佔（`claimId`）的一方能還；不是這個函式庫的錯誤 → 丟出去。
4. **付款是事實，但要是這張訂單的。**`markPaid` 不論訂單當時在 `confirming`、`awaiting-approval` 還是 `needs-attention`，都改成 `paid`：背景工作可能在請求還在查的時候，已經把訂單還給用戶了。改之前先比對 LINE Pay 回報的 `orderId` 和 `request` 時存下的 `linePayOrderId`，不符就轉給人處理。履約（`onPaid`）只在「把訂單改成 `paid`」的那個行程執行一次。
5. **成功後的資料庫寫入在 `try` 之外。**如果寫入失敗，訂單留在 `confirming`，背景工作會從付款明細發現它已付款。
6. **每次 `request` 用新的 `orderId`。**逾時時 LINE Pay 可能已經留下那個編號，同一個編號再來一次會被當成重複（1172）拒絕，這張訂單就永遠付不了。兩次連點的另一個請求也不會被送去付一筆沒人記得的交易。（這只適用於 `request`：`payPreapproved` 相反，重試要用**同一個** `orderId`，換新的就是新的一筆付款。）

## 選一個你的框架

- [Express](./express)
- [Web 標準 Handler](./web-handler)：Next.js、Cloudflare Workers、Bun、Deno、Hono
- [NestJS](./nestjs)
- [背景對帳](./background-job)：收尾的那一半，和退款

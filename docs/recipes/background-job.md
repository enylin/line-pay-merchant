# 背景對帳

[結果未知](../guide/unknown-outcome)不一定發生在用戶還在等的時候。回應可能在行程被殺掉後才遺失，用戶也可能早就離開頁面。所以需要一個背景工作，把「進行中」的訂單收斂到確定的狀態。

## 做法

<<< @/../examples/payment-service.ts#sweep{ts}

`settlePending` 找出在 `confirming` 停留超過 `olderThanMs` 的訂單，用事先存下的 `pendingConfirm`（一個 `ReconcileContext`）去對帳：

| 對帳結果        | 訂單的下一步                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applied`       | → `paid`（訂單在什麼狀態都是：付款是事實）。                                                                                                              |
| `not-applied`   | → `awaiting-approval`：這是**第二次**看了（第一次是處理請求時看的，那一次不放行），隔了幾分鐘仍然沒有，才還給用戶；用戶如果再回到 `confirmUrl` 可以重來。 |
| `indeterminate` | 留在 `confirming`，下一輪再查。超過 `giveUpAfterMs` 還是無法判斷 → `needs-attention`。                                                                    |

一筆訂單處理失敗（例如資料庫暫時連不上）**不會**擋住其他筆。`settlePending` 會把每一筆都處理完，最後才把所有失敗包成一個 `AggregateError` 丟出，讓排程看得到錯誤並告警；沒處理成的那幾筆下一輪還會再來。

## 怎麼跑

- 在常駐的伺服器上，`setInterval` 就夠用（見 [Express](./express)）。更好的是獨立的 worker 或排程（cron、佇列），不要綁在處理 HTTP 的行程上。
- 無伺服器環境用平台的排程功能（見 [Web 標準 Handler](./web-handler)）。
- 一個行程裡一次只跑一輪（範例會等上一輪結束），多個行程可以同時跑：每個轉換都是條件更新，同一筆訂單只有一個會贏；輸的那個不會做任何事。

## 閾值怎麼選

- `olderThanMs`：比請求處理 `confirm` 加上後續查詢可能花的最長時間還長。預設時限下，`confirm` 最多 40 秒，接著查付款明細最多 3 次 × 60 秒，總共約 3.7 分鐘，所以建議 **5 分鐘**。太短，掃描會和還在進行的請求搶。有 `claimId` 和 `markPaid` 保護，搶了也不會出錯，但會白做工，也可能讓用戶看到不必要的「請重試」。
- `giveUpAfterMs`：付款明細有時會延遲出現。給它足夠的時間，例如 1 小時，再交給人。

## 遲到的成功

`not-applied` 說的是「付款明細**現在**沒有」。這個範例用兩道防線擋住「查不到就放人」的誤判：請求自己看到 `not-applied` 時**不放行**，等掃描在幾分鐘後第二次看；而且 `markPaid` 不管訂單被還到哪個狀態，只要付款明細出現這筆就改成 `paid`。

剩下的風險是：兩次都查不到之後，LINE Pay 才過了很久完成這筆付款，而用戶也沒有回來。這種情況只有商家後台的交易報表看得到，所以**每天**拿報表對一次訂單，是最後一道防線，函式庫無法替你做。

## needs-attention 要有人看

這個狀態代表「系統無法判斷」，不是「失敗」。請：

1. 對這個狀態告警（日誌、通知或儀表板）；
2. 到 LINE Pay 商家後台查那筆交易；
3. 依實際狀態手動把訂單改成 `paid` 或 `awaiting-approval`。

## 退款也一樣

退款**不能**重送，所以更需要事先存下的紀錄：

<<< @/../examples/reconcile.ts#refund-record{ts}

背景工作對這種紀錄呼叫 `linePay.reconcile(context)`：

- `applied`：找到恰好一筆符合的退款，把它記下來。
- `indeterminate`：**永遠不要因此重送。**到商家後台確認。對退款，`reconcile` 光看付款明細，絕不會回 `not-applied`（見[限制](../guide/unknown-outcome#退款要特別小心)）。

## 從資料庫讀回 context

`ReconcileContext` 可以存成 JSON。讀回來時 `startedAt` 是字串，`reconcile` 直接接受（帶時區的 ISO 8601 字串或毫秒時間戳記），不用轉回 `Date`：

```ts
await linePay.reconcile(saved)
```

`startedAt` 缺少或不可信（例如沒有時區的字串）時，`reconcile` 會回 `indeterminate` 並說明原因，而不是亂猜。

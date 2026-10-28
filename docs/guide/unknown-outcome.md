# 結果未知與對帳

## 問題

你呼叫 `confirm`，等了 40 秒，逾時了。這時候：

- 請求可能根本沒到 LINE Pay，用戶沒被扣款。
- 請求可能到了，LINE Pay 也扣款成功了，只是回應在路上遺失。

兩種情況在你這邊看起來**一模一樣**。如果你把它當成失敗，就會有用戶被扣了款卻看到「付款失敗」；如果你直接重送，`confirm` 在 V3 通常還好（LINE Pay 會以「重複」拒絕第二次；V4 尚待沙盒驗證），但 `refund` 就可能退兩次。

所以這個函式庫不把這種情況叫做「失敗」。它的 `outcome` 是 `'unknown'`，而且提供一個方法去**查證**。

## 對帳：client.reconcile()

`reconcile` 做的事很單純：去查 `paymentDetails`，看付款明細裡有沒有這個呼叫生效的痕跡，回答三者之一。它**只讀、不寫**，絕不會重送原本的請求。

| `status`        | 意思                                     | 你該怎麼做                                                                                                                                                                           |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `applied`       | 生效了。`body` 是依付款明細重建的回應。  | 當成成功處理。記錄 `notes`。                                                                                                                                                         |
| `not-applied`   | 沒有生效（至少付款明細**現在**這樣說）。 | **一次查詢不夠。**隔幾分鐘再查第二次，兩次都沒有，才把訂單還給用戶重試。重試時 `payPreapproved` 要用**同一個 `orderId`**（LINE Pay 靠它擋重複；換新的 `orderId` 就是新的一筆付款）。 |
| `indeterminate` | 證據不足以判斷。`reason` 說明原因。      | **不要猜。**稍後再查，或到商家後台確認。                                                                                                                                             |

<<< @/../examples/reconcile.ts#basic{ts}

`needsReconcile(error)` 在同時符合以下三點時為 `true`：

1. 操作是 `confirm`、`capture`、`void`、`refund`、`payPreapproved` 之一；
2. 錯誤帶有 `context`（由 client 附上）；
3. `outcome` 是 `'unknown'`，或 LINE Pay 回了重複的代碼（`category: 'duplicate'`，見[錯誤與結果](./errors#line-pay-的-returncode)）。

其他錯誤（輸入不合法、被拒絕、確定沒送出）不需要查，`reconcile` 也會直接回答：沒送出、被拒絕的呼叫是 `not-applied`，不用多打一次 API。

## 每個操作怎麼判斷

| 操作             | 查什麼                        | 判成 `applied`                                                                                                         | 判成 `not-applied`                                               | 其餘                                                                                                                                                           |
| ---------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `confirm`        | 用 `transactionId` 查付款明細 | 付款存在，狀態是 `CAPTURE` 或 `AUTHORIZATION`，幣別相同，且各付款方式的金額加總等於 confirm 的金額                     | 付款明細裡沒有這筆（條件見下）                                   | `indeterminate`                                                                                                                                                |
| `capture`        | 同上                          | 狀態是 `CAPTURE`，且金額、幣別相符                                                                                     | 狀態仍是 `AUTHORIZATION`                                         | `indeterminate`                                                                                                                                                |
| `void`           | 同上                          | 狀態是 `VOIDED_AUTHORIZATION`                                                                                          | 仍是 `AUTHORIZATION`、已 `CAPTURE`、或已 `EXPIRED_AUTHORIZATION` | `indeterminate`                                                                                                                                                |
| `payPreapproved` | 用 `orderId` 查               | 恰好一筆帶這個 `orderId` 的付款，狀態是 `CAPTURE` 或 `AUTHORIZATION`，金額與幣別相符，而且時間**晚於呼叫開始的那一秒** | 沒有任何帶這個 `orderId` 的付款（條件見下）                      | `indeterminate`（多筆、已作廢或過期、金額不符、是呼叫之前的舊付款、有讀不懂的條目）                                                                            |
| `refund`         | 用原付款的 `transactionId` 查 | `refundList` 裡**恰好一筆**金額相同（取絕對值）、且時間**晚於呼叫開始的那一秒**，而且沒有讀不懂的同額條目              | **永遠不會**                                                     | `indeterminate`。LINE Pay 以重複代碼拒絕的退款，也**一律** `indeterminate`，而且不查：找得到的退款是它所重複的那次呼叫做的，算在這次頭上會把一筆退款數成兩筆。 |

**`not-applied` 的條件。**「查不到」要同時符合三點才算證據：

1. 付款明細**完全沒有**任何條目。回傳裡有對不上的條目（例如 ID 差一個字元、另一張訂單），就是 `indeterminate`：對不上的條目裡，可能正好有這次的付款。
2. LINE Pay 沒有說這次呼叫是重複的（`category: 'duplicate'` 的代碼）。它說有，你卻查不到，就不能說沒發生。
3. context 帶有 `channelId`。用另一個 channel 的憑證什麼都查不到（見下）。

三點缺一，回答是 `indeterminate`，`reason` 會說是哪一點。

**`applied` 與請款。**`confirm`、`payPreapproved` 的 context 不知道這次呼叫要不要請款（capture，預設要）。付款若只是 `AUTHORIZATION`，`applied` 的 `notes` 會多一則提醒：授權沒有請款會到期失效，請再看一次付款。

`request`、各種查詢，以及 `expireRegKey` 不支援對帳：`request` 逾時時用戶根本還沒拿到付款網址，不會有錢被動到；查詢可以隨時重做。

## 自動對帳：autoReconcile()

每次都手寫 `try/catch` 很煩，而且容易漏。`autoReconcile()` 把同樣的流程包成 middleware。它**不是預設**，因為它會把錯誤變成成功，所以由你選擇開啟：

<<< @/../examples/reconcile.ts#auto{ts}

- 對帳確認生效時，呼叫**回傳**推論出的結果，`meta.recovered` 會標明：
  - `reason`：`'unknown-outcome'`（逾時、斷線）或 `'duplicate'`（LINE Pay 回重複）；
  - `cause`：原本的錯誤；
  - `notes`：證據沒有涵蓋的部分，**請讀**。
- 否則**重新丟出原本的錯誤**，並把結論放在 `error.reconcileConclusion`（`status` 與 `reason`）。你拿到的是原本的錯誤加上對帳的結論，不是被改寫過的錯誤。
- 可以只對部分操作啟用：`autoReconcile({ operations: ['confirm'] })`。
- 請放在 `retryWhenNotSent()` 的**內側**（用 `client.with(autoReconcile())` 就是這個順序），這樣 `meta.attempts` 才會算對。
- **整個呼叫的期限會讓它來不及查。**對帳用的是同一個 `signal`：如果你用 `AbortSignal.timeout(8000)` 限制整個呼叫，而期限到的時候請求已經送出，這個 `signal` 已經觸發，查詢不會發出，錯誤照原樣丟出，`reconcileConclusion` 是 `indeterminate`（原因是中止）。這時請用 `client.reconcile(error)`（不帶那個 `signal`）稍後再查，例如交給[背景工作](/recipes/background-job)。

## 行程在拿到回應前就掛了

最危險的情況不是逾時，而是**你的行程在等待期間被殺掉**：部署、OOM、當機。這時根本沒有錯誤物件可以傳給 `reconcile`。

解法是在呼叫**之前**把 `ReconcileContext` 存起來，事後由背景工作拿它去對帳：

<<< @/../examples/reconcile.ts#context{ts}

`ReconcileContext` 是一般的物件（`operation`、`startedAt`，加上交易編號、金額等），存進資料庫沒問題。各操作需要的欄位**一個都不能少**，而且型別要對（交易編號和 `orderId` 是字串、金額是數字）：少了或型別不對，`reconcile` 回 `indeterminate` 並說明是哪個欄位，**不去查**。這是刻意的：資料庫讀回來的 `orderId` 若是數字，永遠不會等於 LINE Pay 回報的字串，「查不到」就會被誤讀成「沒發生」。

| 操作                 | 必要                                  | 另外會用                           |
| -------------------- | ------------------------------------- | ---------------------------------- |
| `confirm`、`capture` | `transactionId`、`amount`、`currency` |                                    |
| `void`               | `transactionId`                       |                                    |
| `refund`             | `transactionId`                       | `refundAmount`（全額退款就不要放） |
| `payPreapproved`     | `orderId`、`amount`、`currency`       |                                    |

每個錯誤的 `context` 還帶著 `channelId`（你的 client 的 Channel ID）。自己存的 context **一定要放上**：`reconcile` 發現它屬於另一個 channel 時會拒絕去查；沒有 `channelId` 的 context，則不會得到 `not-applied`。因為用別人的憑證查不到這筆付款，而「查不到」不能被當成「沒發生」。從 JSON 讀回來的 `startedAt` 是字串或數字，`reconcile` 都接受：帶時區的 ISO 8601 字串（`2026-10-27T00:00:00Z`）或**毫秒**時間戳記（小於 `1e12` 的數字很可能是秒，會被拒絕），不需要先轉回 `Date`。各操作的細節見 [API 參考](/api/interfaces/ReconcileContext)。

完整的訂單狀態機、搶佔與背景工作，見[背景對帳](/recipes/background-job)。

## 退款要特別小心

退款**不是冪等的**：部分退款本來就可以合法地重複，所以 LINE Pay 無法替你擋重複。因此：

- 絕不要自己包重試迴圈。預設的 middleware 也不會重試退款（除非確定沒送出）。
- `reconcile` 光看付款明細，對退款**永遠不會**回 `not-applied`。付款明細裡找不到退款，不代表 LINE Pay 沒做：它可能還在處理。（確定沒送出、或被 LINE Pay 拒絕的退款，由錯誤本身證明，不用查。）
- 它只在「恰好一筆」符合的退款時回 `applied`；沒有或有多筆都回 `indeterminate`。退款清單裡有讀不懂的條目（類型不認得、時間沒有時區），而且它的金額與這次相同、**可能就是**這次的退款時，也一律 `indeterminate`。
- **同一筆付款的退款要排隊。**付款明細可能只有秒級精度，同秒退款會回 `indeterminate`，而相隔數秒、同金額的併發退款依然可能混淆。同時對同一筆付款發兩筆同金額的退款（兩個管理員一起按、`Promise.all`），其中一筆遺失時，另一筆會被算在它頭上。對同一筆付款的退款加鎖或排隊，這在帳務上本來就該做。
- 看到 `indeterminate`，請到商家後台確認，確認沒有退款再重新發起。

## 限制

對帳是**推論**，不是 LINE Pay 的回應。請理解它的界線：

- **regKey 找不回來。**預先授權付款的 `confirm` 才會回 `regKey`；付款明細裡沒有。這種情況 `applied` 的 `notes` 會警告，需要人工處理。
- **分不出是哪一次呼叫。**付款明細只告訴你「現在的狀態」。例如 `capture` 顯示 `CAPTURE`，可能是別的呼叫請的款。`notes` 會寫明。
- **「查不到」是「現在查不到」。**`not-applied` 說的是付款明細**此刻**沒有這筆，不是「LINE Pay 永遠不會處理它」。付款明細可能比實際慢，剛逾時就查，查不到並不保證沒扣。所以：逾時後別只查一次就把訂單還給用戶，隔幾分鐘再查第二次；還給用戶之後也要留一個機制，讓遲到的成功仍能把訂單標成已付款（見[背景對帳](/recipes/background-job)）。每天拿商家後台的交易報表對一次帳，仍然是最後一道防線。
- **時鐘與「同一秒」。**退款與預先授權付款只採計「晚於呼叫開始那一秒」的紀錄，所以伺服器時間要準（NTP）。這是刻意的：如果放寬，稍早做的同額退款會被誤認成這一次。但付款明細的時間只到秒，因此 SDK 將**呼叫開始的同一秒**內退款視為 `indeterminate`，不會認定為這次成功。這可能漏認一筆真正成功的退款，卻能避免拿較早的退款當作這次的結果。時鐘不準會再加一層：你的時鐘比 LINE Pay 的**快**，真正發生的退款會顯得比呼叫「早」，結果是多回 `indeterminate`；比 LINE Pay 的**慢**，更早一點的同額退款也會落進視窗。這種風險很小（需要同一筆付款在幾秒內有兩筆同金額退款），但退款不可逆，所以 `applied` 的 `notes` 會提醒：金額大時請到商家後台確認，並且把同一筆付款的退款排隊。付款明細中沒有時區（`Z` 或 `+08:00`）的時間戳記一律不採信，`startedAt` 也一樣：早於 `1e12` 毫秒的時刻（秒當成毫秒、`new Date(null)`、1970 年）無論用什麼形式給，都會被拒絕。
- **看不懂就不猜。**付款明細的格式不是預期的樣子（缺欄位、型別不對、金額不是數字、同一筆出現多次、類型讀不懂）時，`reconcile` 回 `indeterminate`，`reason` 說明哪裡讀不懂；它不會因此丟出例外，也不會把半個答案當成真的。
- **V4 付款明細可能沒有 `payStatus`。** SDK 仍可解析這種官方範例形式的明細，退款對帳也能讀取 `refundList`；但要判斷授權、請款或取消授權是否生效，缺少狀態時會回傳 `indeterminate`，不會猜測已扣款。
- **`1150` 被當成「沒有這筆交易」。**V3 的沙盒對查不到的交易回 `1150`（觀察所得，文件沒寫），`reconcile` 把它當成空的答案，而不是讀取失敗，`confirm` 與 `payPreapproved` 才有可能得到 `not-applied`。V4 是否一樣尚待驗證（`TODO(v4-spec)`）。如果 V4 的 `1150` 另有意思，`not-applied` 就可能是錯的；上線前請在沙盒查一個不存在的交易，確認答案。
- **它假設付款明細只列出已 confirm 的付款。**如果 V4 也列出「用戶已核准、尚未 confirm」的付款，`confirm` 的對帳可能把尚未 confirm 的訂單判成 `applied`。這是 V4 尚待沙盒驗證的假設（`TODO(v4-spec)`）。
- **你的 `fetch` 不可以自己重試。**「確定沒送出」的判斷建立在每次 `fetch` 呼叫只送一次請求之上。自訂的 `fetch`，或全域設定了會重試 POST 的 undici RetryAgent，會讓一次呼叫實際送出兩次。
- **自訂的 `fetch` 還必須遵守 `redirect: 'error'` 與 `signal`。**函式庫要求拒絕轉址，這樣簽章才不會被送到別的主機；它也靠中止 `signal` 來結束一次呼叫。會跟隨轉址的 `fetch` 會把已簽章的請求繼續送出去，忽略 `signal` 的 `fetch` 則可能活得比時間限制還久。
- **`applied` 說的是「有這筆付款」，不是「這筆付款是你的」。**對 `confirm` 來說，它的意思是：有一筆這個 `transactionId`、這個金額、這個幣別的付款已經確認。這筆付款屬於哪張訂單，只有你自己的紀錄知道，所以 `transactionId` 要取自你存下它的那張訂單，並且拿結果的 `body.info.orderId` 跟你送給 `request` 的訂單編號比對。
- **記錄下來。**把 `meta.recovered` 寫進日誌。它是稽核軌跡的一部分。

::: warning 「重試是安全的」要先在沙盒驗證
`not-applied`（而且是隔幾分鐘的第二次查詢也一樣）之後重試 confirm、capture、void，建立在 LINE Pay 會以重複代碼（`category: 'duplicate'` 的其中一個）拒絕同一筆交易的第二次呼叫之上；`payPreapproved` 則靠 `orderId`，重試**一定要用同一個 `orderId`**，換新的就是新的一筆付款，第一次若遲到成功就會扣兩次。這是 V3 的行為，V4 尚待沙盒驗證。上線前請在沙盒對同一個 `transactionId` 連續 confirm 兩次，確認第二次被拒絕而不是再扣一次。
:::

## 建議的做法

把「進行中」當成訂單狀態機裡一個明確的狀態：

| 轉換                                      | 條件                                                                                                                                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `created` → `awaiting-approval`           | `request` 成功，存下 `transactionId`。                                                                                                                                                                                            |
| `awaiting-approval` → `awaiting-approval` | 用戶在 LINE Pay 取消、或關掉頁面後想重新付款：再 `request` 一次（用新的訂單編號），並用「你讀到的那個 `transactionId`」做條件更新來存新的 `transactionId`，這樣同時兩次點擊只會留下一個預約。舊的預約不會被 confirm，會自己過期。 |
| `awaiting-approval` → `confirming`        | 用戶回到 `confirmUrl`。用條件更新**搶佔**，同時寫下 `ReconcileContext` 和一個隨機的 `claimId`。                                                                                                                                   |
| `confirming` → `paid`                     | `confirm` 成功，或對帳回 `applied`。付款是事實：訂單在什麼狀態（`confirming`、`awaiting-approval`、`needs-attention`）都改成 `paid`。                                                                                             |
| `confirming` → `awaiting-approval`        | 確定沒生效：被拒絕、沒送出，或**隔了幾分鐘的第二次**對帳仍回 `not-applied`。只能由持有這次搶佔（claim）的一方還回去。                                                                                                             |
| `confirming` → （留著）                   | 對帳回 `indeterminate`，或**第一次**回 `not-applied`。由背景工作稍後再查。                                                                                                                                                        |
| `confirming` → `needs-attention`          | 過了很久仍然無法判斷。交給人到商家後台確認。                                                                                                                                                                                      |

搶佔用條件更新（`UPDATE … WHERE status = 'awaiting-approval'`），讓同時湧入的兩個請求只有一個能送出 `confirm`。

# 設定

<<< @/../examples/config.ts#options{ts}

## 所有選項

| 選項                      | 型別                                     | 說明                                                                                                                                                          |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `channelId`               | `string`                                 | Channel ID。必填。會放進標頭，所以只接受可列印的 ASCII，前後不能有空白。                                                                                      |
| `channelSecretKey`        | `string`                                 | Channel Secret Key。必填。只放在伺服器端。前後不能有空白。                                                                                                    |
| `env`                     | `'sandbox' \| 'production'`              | 必填。決定主機。                                                                                                                                              |
| `timeout`                 | `number`                                 | 每次嘗試的時限（毫秒，1 到 2147483647），套用到所有沒有更具體設定的操作。                                                                                     |
| `timeouts`                | `Partial<Record<OperationName, number>>` | 各操作的時限。                                                                                                                                                |
| `fetch`                   | `typeof fetch`                           | 取代全域的 `fetch`：走代理、固定 IP 或測試時使用。**不可以自己重試請求**。                                                                                    |
| `baseUrl`                 | `string`                                 | 取代 `env` 選出的主機。必須是 https（localhost 除外），且不能帶帳號密碼。路徑前綴只會被送出、**不會被簽名**，只能用在會先去掉前綴再轉給 LINE Pay 的代理後面。 |
| `merchantDeviceProfileId` | `string`                                 | 會以 `X-LINE-MerchantDeviceProfileId` 送出。不能是空字串，要和 `merchantDeviceType` 一起設定。                                                                |
| `merchantDeviceType`      | `string`                                 | 會以 `X-LINE-MerchantDeviceType` 送出。不能是空字串，要和 `merchantDeviceProfileId` 一起設定。                                                                |
| `middleware`              | `Middleware[]`                           | 預設 `[retryWhenNotSent()]`。見 [Middleware](./middleware)。                                                                                                  |
| `validate`                | `boolean`                                | 送出前檢查輸入，預設 `true`。                                                                                                                                 |

設定在建立 client 時就會檢查，有問題會立刻丟出 `LinePayValidationError`，訊息指出是哪個欄位（**不會**把金鑰印在訊息裡）。

從環境變數讀設定時，沒設定的變數是 `undefined`。範例用 `?? ''` 把它變成空字串，不必用 `!` 硬說它一定存在：`createLinePayClient` 會在啟動時拒絕空的 `channelId` 或 `channelSecretKey`，並指出是哪個欄位。

設定只讀物件**自己的**屬性，不讀原型鏈：就算程式別處有 prototype pollution 的漏洞，被污染的 `baseUrl` 也不會讓簽過章的請求送到別的主機。設定的值要是物件**自己的**屬性（物件字面量、`JSON.parse` 的結果）：放在原型上的 getter 讀不到，`channelId` 會顯示為空而被拒絕。另外，runtime 的 `JSON.parse` 必須把數字的原始文字交給 reviver（V8 11.4，也就是 Node.js 22 以上），否則 19 位數的交易編號會被悄悄捨入，所以這樣的環境根本建立不了 client。

會放進 HTTP 標頭的值（`channelId`、`merchantDeviceProfileId`、`merchantDeviceType`）只接受可列印的 ASCII 字元（中間可以有空白，前後不行），換行、Tab 與其他控制字元一律拒絕；金鑰不能含控制字元，前後也不能有空白。這通常是從 `.env` 或密碼管理員貼上時多出來的換行，與其讓每一次簽章都默默地錯，不如在啟動時就失敗。

裝置識別為選用設定，但 LINE Pay V4 規定必須一起提供 `merchantDeviceProfileId` 和 `merchantDeviceType`（字串，透過 `X-LINE-MerchantDeviceType` 傳送）。若只設定其中一個，建立 client 時會失敗。

## 逾時

「逾時」是**每次嘗試**的時限。決定一次呼叫用多少時間，優先順序是：

1. 這次呼叫的 `{ timeout }`
2. `timeouts[operation]`
3. `timeout`
4. 該操作的預設值

| 操作      | 預設  | 操作                 | 預設  |
| --------- | ----- | -------------------- | ----- |
| `request` | 20 秒 | `paymentDetails`     | 60 秒 |
| `confirm` | 40 秒 | `checkPaymentStatus` | 20 秒 |
| `capture` | 60 秒 | `checkRegKey`        | 20 秒 |
| `void`    | 20 秒 | `payPreapproved`     | 40 秒 |
| `refund`  | 20 秒 | `expireRegKey`       | 20 秒 |

預設值是 LINE Pay 對各 API 建議的讀取逾時（V3 的建議值，V4 待確認）。逾時太短的代價是更多的「結果未知」，不要調得比預設更短，除非你有[對帳](./unknown-outcome)。

想限制**整個呼叫**（含重試）的總時間，用 `AbortSignal`：

<<< @/../examples/config.ts#per-call{ts}

期限到的時候，請求若已經送出，結果是「未知」（`outcome: 'unknown'`），不是失敗。`autoReconcile` 查證用的是同一個 `signal`，期限已過就查不了：錯誤會照原樣丟出，稍後再用 `client.reconcile(error)` 查（見[結果未知與對帳](./unknown-outcome#自動對帳-autoreconcile)）。

## 代理與固定 IP

如果你的 LINE Pay 商家設定要求固定的來源 IP，或公司網路必須經過代理，有兩個辦法：

**1. 讓內建的 `fetch` 走代理。**Node.js 24 以上（以及 22.21 以上）在設定環境變數 `NODE_USE_ENV_PROXY=1` 後，內建的 `fetch` 會遵守 `HTTP_PROXY` / `HTTPS_PROXY`。這些變數要在行程**啟動時**就設好（例如 `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://proxy:8080 node server.js`），在程式裡才指定 `process.env` 是來不及的。**沒有**設 `NODE_USE_ENV_PROXY=1` 時，內建的 `fetch` 會無視這些變數、直接連線；0.9 使用的 axios 預設會遵守它們，所以從 0.9 升上來而且靠代理出口的部署要特別留意。

**2. 傳入自己的 `fetch`。**函式庫只透過 `config.fetch` 發出請求，所以任何相容的實作都行：例如 `undici` 的 `fetch`，加上它自己的 `ProxyAgent`（以 `{ dispatcher }` 傳入）。`fetch` 與 dispatcher 要來自同一個 `undici` 版本；只裝 `undici`、再用 `setGlobalDispatcher` 去影響 Node.js 內建的 `fetch`，在兩者的主版本不同時可能不相容。兩個版本的型別也不完全一致，TypeScript 可能需要一個轉接函式。`baseUrl` 可以指向你的轉送主機。

不論哪種，簽章都不會變：簽的是路徑與內容，與主機無關。函式庫**不跟隨轉址**（`redirect: 'error'`），因為自訂的授權標頭不該被轉送到別的來源。

## 多商家

一個 client 對應一組 Channel ID 與 Secret。要服務多個商家，為每個商家建一個 client 並快取起來；client 不可變、沒有全域狀態、建立不會連線：

<<< @/../examples/config.ts#multi-tenant{ts}

## validate

預設 `true`：送出前會檢查輸入，包含 `request` 的金額是否加得起來、欄位的型別，以及有沒有操作不認得的欄位（拼錯的 `refundAmout`、多送的 `customerEmail`）。想把這些檢查交給 LINE Pay 時可以設成 `false`。

`request` 的欄位檢查會一路深入 `redirectUrls`、`options` 與 `packages`，錯誤訊息會指出是哪個物件不認得該欄位。LINE Pay 之後新增、而這個版本還沒收錄的欄位，會在這裡被擋下，直到函式庫跟上。

::: warning 有些檢查不能關閉

- 路徑參數（`transactionId`、`regKey`）：這些值常來自用戶的網址，而且是簽章的一部分。
- 退款的金額：沒有 `refundAmount` 就是**全額退款**，LINE Pay 無從得知你本來想退多少。所以 `refundAmount` 要嘛是大於 0 的有限數字，要嘛整個省略；欄位在、值卻是 `undefined`、`NaN`、字串，或欄位名稱拼錯，一律拒絕，`validate: false` 也一樣。
- 輸入必須是純資料：class 的實例、帶 getter 的物件、不可列舉的欄位，在複製時會悄悄少掉欄位（退款少了 `refundAmount` 就是全額退款），所以直接拒絕並指出位置。要傳 class 裡的資料，自己組一個物件字面量：`{ transactionId: x.transactionId, refundAmount: x.refundAmount }`。

:::

`validate` 檢查金額是有限、大於 0 的數字，**不**檢查各幣別的小數位數（TWD 沒有小數，USD 有兩位）。不合規格的金額由 LINE Pay 拒絕；金額的精度請在你自己的程式裡確保，並避免用浮點數加總價格。

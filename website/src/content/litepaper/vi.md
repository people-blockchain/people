---
title: "People Blockchain — Litepaper"
description: "Blockchain nơi mỗi người dùng là một con người đã được xác minh. Sở hữu bởi con người, không phải các quỹ VC."
slug: /litepaper
version: "1.1"
date: 2026-10
status: public-draft
---

# People Blockchain — Litepaper

> **Blockchain nơi mỗi người dùng là một con người đã được xác minh.**
> **Sở hữu bởi con người, không phải các quỹ VC.**

*v1.1 · Tháng 10 năm 2026 · Các số liệu là sơ bộ và có thể thay đổi theo quản trị cộng đồng. Không có gì trong tài liệu này là một cam kết về lợi tức.*

---

## Tóm lược

| | |
|---|---|
| Cung cấp | **1.000.000.000 PPL**, cố định |
| Mỗi token được phát hành | **27%** cung cấp đi vào nhóm cộng đồng của token đó |
| Phí mạng bị đốt cháy | **0%** — mỗi phí được chia sẻ |
| Ai kiếm được phần thưởng | **Những con người được xác minh** (số điện thoại Telegram hoặc Human Passport) |
| Tài trợ | **Tự trợ cấp.** Không VC. Không phân bổ nhà đầu tư. |
| Mạng hôm nay | Testnet công cộng **testnet** — Cosmos EVM, chain id `people_97401-1` / EVM `97401` |

---

## 1. Vấn đề

**Crypto được xây dựng cho những người nội bộ.** Hầu hết các chuỗi giả định bạn có thể đọc mã, quản lý cụm từ hạt giống và phát hiện lừa đảo tự mình.

**Bot nhận được phần thưởng.** Các airdrop và chương trình phần thưởng bị trang trại bởi các kịch bản và tài khoản giả. Những người thực sự nhận được một phần nhỏ.

**Các bản phát hành ưu tiên cá voi.** Các vòng riêng tư và phân bổ nội bộ có nghĩa là cộng đồng thường đến sau cùng và trả giá cao nhất.

## 2. Câu trả lời của chúng tôi

**Một blockchain cho những người bình thường.** Một điện thoại hoặc trình duyệt là đủ. Khởi chạy một token, tạo thẻ câu lạc bộ hoặc gây quỹ cho một ý tưởng — bằng một biểu mẫu, không phải mã.

**Những con người được xác minh, không phải bot.** Phần thưởng đi đến những tài khoản đã vượt qua một bài kiểm tra con người miễn phí. Một người, một tài khoản. Chỉ đăng ký không kiếm được gì.

**27% của mỗi token được phát hành đi vào cộng đồng của nó.** Được tích hợp vào giao thức, không hứa hẹn trong một bài đăng: mỗi bản phát hành tiêu chuẩn gửi 27% cung cấp của nó đến nhóm cộng đồng của token đó. Nó không bao giờ được trộn với phí mạng.

---

## 3. Sản phẩm

Những gì bạn có thể làm mà không cần mã:

| Công cụ | Nó làm gì | Trạng thái |
|---|---|---|
| **Token không cần mã** | Tên, ticker, hình ảnh, cung cấp. Token có được trực tiếp trên đường cong liên kết của nó; giao dịch đầu tiên đặt giá. 27% cung cấp đi vào nhóm cộng đồng của token; cổ phần của người tạo được phân bổ trong 180 ngày. | Hoạt động trên testnet |
| **Thẻ câu lạc bộ NFT** | Thẻ thành viên cho một câu lạc bộ, một quán cà phê hoặc một cộng đồng — một cho mỗi thành viên, với hình ảnh bạn tải lên hoặc tạo. | Hoạt động trên testnet |
| **Gây quỹ** | Thu thập sự hỗ trợ cho một dự án với các mẫu hợp đồng được xem xét: ký quỹ, phân bổ, quyết định có trọng số token. Cộng đồng của bạn mua vào trên đường cong, do đó nhu cầu đặt giá — không phải một vòng riêng tư. | Hoạt động trên testnet |
| **Hợp đồng AI** | Mô tả một hợp đồng thông minh bằng từ thường. Nó được lắp ráp từ các mẫu OpenZeppelin và bạn thấy kết quả trước khi triển khai. | Hoạt động trên testnet |
| **Agent AI Cộng đồng** | Agent làm việc cho một nhóm: ví cộng đồng multisig với giới hạn chi tiêu, danh sách trắng và đóng băng khẩn cấp. Các tham số chỉ thay đổi theo quyết định token; mỗi hành động đều hiển thị trong trình khám phá. | Testnet: 1 agent cộng đồng đang hoạt động |

---

## 4. Công nghệ

**Cosmos EVM.** People chạy trên ngăn xếp Cosmos EVM: hợp đồng thông minh tương thích Ethereum và địa chỉ 0x trên chuỗi Cosmos.

| Tham số | Giá trị |
|---|---|
| Cosmos chain id | `people_97401-1` |
| EVM chain id | `97401` |
| Đồng tiền asli | PPL (denom cơ sở `appl`, 18 chữ số thập phân) |
| Tiền tố địa chỉ | `people1…` (và cùng một tài khoản như `0x…` trong EVM) |
| Trạng thái mạng | Testnet công cộng — không phải mainnet |

**Trình xác thực.** Các trình xác thực chạy mạng và được trả tiền từ nhóm xác thực được phân bổ trước cộng với 30% của mỗi phí mạng. Các trình xác thực testnet chạy cho mục đích thử nghiệm; mở xác thực và cược cho công chúng là một giai đoạn lộ trình sau này.

**Xác minh — một bài kiểm tra rằng bạn là một người.** Miễn phí, làm một lần:

- **Cấp 1 — Telegram:** chia sẻ số điện thoại của bạn một lần trong bot Telegram của chúng tôi. Một số cho mỗi nhà sáng lập. Kiếm được 50% điểm cơ sở.
- **Cấp 2 — Human Passport:** xác minh với Human Passport. Kiếm được 100% điểm cơ sở.
- **Không xác minh, không có điểm.** Không có điểm nhà sáng lập trên testnet và không có phần thưởng PPL cá nhân trên mainnet mà không có nó.

---

## 5. Kinh tế token

**Cung cấp cố định: 1.000.000.000 PPL.** Năm 1-4: 0% lạm phát. Từ năm 5 trở đi, bất kỳ phát thải mới nào bị giới hạn ở 2% mỗi năm và chỉ bằng quyết định cộng đồng.

### Phân bổ Genesis

| Nhóm | Chia sẻ | PPL |
|---|---:|---:|
| Cộng đồng & phần thưởng | 35% | 350.000.000 |
| Trình xác thực & cược | 20% | 200.000.000 |
| Nhóm & nhà sáng lập | 15% | 150.000.000 |
| Kho tài sản Hệ sinh thái (DAO) | 15% | 150.000.000 |
| Bán cộng đồng | 10% | 100.000.000 |
| Tính thanh khoản | 5% | 50.000.000 |

- **Phân bổ nhóm & nhà sáng lập (15% cung cấp):** 0% khi khởi chạy, 6 tháng vách đá, sau đó 18 tháng tuyến tính (24 tháng tổng cộng).
- **Không có nhóm nhà đầu tư.** Không có phân bổ VC hoặc vòng riêng tư.
- **Phần thưởng đến từ các nhóm hiện có.** Những người sáng lập, tiền thưởng, đại sứ và airdrop chỉ được thanh toán từ nhóm Cộng đồng & phần thưởng. Không có tiền mới được đúc cho họ.

### Chia sẻ phí mạng

Mỗi phí giao thức, bao gồm phí phân số, được chia theo cách tương tự:

| Người nhận | Chia sẻ |
|---|---:|
| Trình xác thực | 30% |
| Nhóm cộng đồng | 25% |
| Kho tài sản | 20% |
| Tính thanh khoản | 10% |
| Nhóm tăng trưởng | 15% |
| Đốt cháy | 0% |

**Mua lại.** Cổ phần của kho tài sản (20%) và tính thanh khoản (10%) được sử dụng cho các mua lại PPL công cộng. Không có gì bị đốt cháy để giả lập hiếm — phí quay trở lại mạng và con người của nó.

**Phí khởi chạy token.** Hoạt động trên testnet: các nhà máy đã triển khai vẫn thu phí cố định bằng PPL — 1,045005 PPL để ra mắt token và 2,925 PPL để đúc NFT. Kế hoạch đã được phê duyệt là mức phí cố định **5 USD cho mỗi lần ra mắt token và 10 USD cho mỗi lần đúc NFT**, trả bằng PPL, USDT hoặc USDC, với ưu đãi 20% khi trả bằng PPL theo giá TWAP. Tùy chọn stablecoin và ưu đãi TWAP chưa có trong mã đã triển khai. 100% phí khởi chạy được chuyển vào quỹ mua lại PPL công khai, và PPL mua lại được chia 30/25/20/10/15 bởi multisig của ngân khố, giống như mọi lần mua lại khác.

---

## 6. Một Triệu Nhà Sáng Lập

**Trở thành một trong triệu người đầu tiên được xác minh.** Nhận một số nhà sáng lập, mời bạn bè và kiếm được điểm khi *họ* làm những điều thực sự trên mạng.

**Điểm đến từ những hành động thực sự, không phải đăng ký.** Bạn chỉ kiếm được điểm mời sau khi người mời của bạn đã xác minh, tạo ví và thực hiện ít nhất một hành động testnet thực sự (hoán đổi, nhóm thanh khoản, NFT mint, khởi chạy token hoặc bỏ phiếu quản trị). Chỉ đăng ký = 0.

**Làm thế nào điểm trở thành PPL:**

> **PPL trên mỗi điểm = nhóm nhập mùa ÷ tất cả các điểm kiếm được trong mùa**

- **Nhóm Mùa 1:** 6.000.000 PPL, thanh toán từ nhóm Một Triệu Nhà Sáng Lập hiện có. Không có tiền mới. Khi nhóm trống, chương trình dừng.
- **Thanh toán:** 10% một lần, 90% còn lại trong các lát bằng nhau trong 52 tuần.
- **Chống trang trại:** chỉ hai cấp độ giới thiệu, một giới hạn cho mỗi mùa trên người mời hoạt động, và lấy lại điểm từ những tài khoản được gắn cờ là bot.

*Sơ bộ. Điểm, tỷ lệ PPL trên mỗi điểm và ngân sách mùa có thể thay đổi trước mainnet. Không phải là một cam kết về lợi tức.*

---

## 7. Lộ trình

| Giai đoạn | Điều gì xảy ra | Cổng |
|---|---|---|
| **Mùa 0 — Testnet công cộng** | Ví, xác minh, khởi chạy token, thẻ NFT, hoán đổi, điểm Million Founders. | Bây giờ |
| **Mainnet + bán PPL** | Mainnet khởi chạy. Đợt bán PPL chưa mở; chỉ mở khi có một thực thể pháp lý điều hành. | Ít nhất 1.000 người được xác minh **và** một multisig kho tài sản trực tiếp |
| **Cược & trình xác thực** | Cược và tham gia trình xác thực mở ra ngoài dự án. | Sau mainnet |

Không có ngày được hứa hẹn. Mỗi giai đoạn bắt đầu khi cổng của nó đạt được.

---

## 8. Nhóm & tài trợ

- **Ẩn danh theo lựa chọn.** Một nhóm nhỏ. Chúng tôi xuất bản công việc, mã và quy tắc, không phải khuôn mặt.
- **Tự trợ cấp.** Không có tiền VC. Không có phân bổ nhà đầu tư. Không có vòng riêng tư.
- **Các quy tắc tương tự như mọi người.** Phân bổ của nhóm 15%: 0% khi khởi chạy, 6 tháng vách đá, sau đó 18 tháng tuyến tính (24 tháng tổng cộng). Không có dòng nhóm trong chia sẻ phí mạng.

---

## 9. Bảo mật

- **Kiểm toán bảo mật trước mainnet.** Hợp đồng giao thức sẽ trải qua kiểm toán bảo mật trước khi khởi chạy mainnet.
- **Multisig kho tài sản.** Kho tài sản được kiểm soát bởi hợp đồng multisig 2-trong-3 riêng của People trên mạng People, được tạo trước mainnet; các địa chỉ ký sẽ được công bố.
- **Địa chỉ được xuất bản.** Địa chỉ hợp đồng bán hàng, phân bổ và thanh khoản sẽ được xuất bản khi khởi chạy mainnet — không có trình giữ chỗ.
- **Phòng chống bot.** Xác minh con người, giới hạn mỗi thiết bị và mỗi IP, giới hạn điểm hàng ngày và lấy lại bot.
- **Các khối xây dựng đã được chứng minh.** Hợp đồng không cần mã được lắp ráp từ các mẫu OpenZeppelin.

---

## 10. Rủi ro & Tuyên bố miễn trừ

- **Không cam kết lợi tức.** PPL, điểm và phần thưởng không phải là một sản phẩm đầu tư. Không có gì ở đây hứa lợi nhuận, năng suất hoặc lợi tức.
- **Giá có thể xuống số không.** Giá token có thể đi lên, xuống hoặc về không.
- **Testnet không phải mainnet.** Các token testnet và số dư không có giá trị. Điểm là một bản ghi của hoạt động, không phải một bảo đảm thanh toán.
- **Mọi thứ đều sơ bộ.** Các số liệu, lịch trình và quy tắc có thể thay đổi trước mainnet và được tùy thuộc vào quản trị cộng đồng.
- **Rủi ro công nghệ.** Phần mềm có thể có lỗi. Kiểm toán làm giảm rủi ro; nó không loại bỏ nó.
- **Quy định.** Quy tắc khác nhau tùy theo quốc gia và có thể thay đổi. Hiện tại không có đợt bán PPL công khai nào; không thực hiện kiểm tra KYC.
- **Tự thực hiện nghiên cứu của bạn.** Bản giới thiệu công nghệ này là thông tin, không phải tư vấn tài chính, pháp lý hoặc thuế.

---

## Cách chúng tôi khác biệt

Chỉ các sự kiện công cộng có thể xác minh về các mạng khác. Nguồn dưới đây.

| | Ethereum | Solana | People |
|---|---|---|---|
| Phí bị đốt cháy | Phí cơ sở bị đốt cháy ¹ | 50% phí cơ sở bị đốt cháy ² | **0% bị đốt cháy** |
| Ai nhận phí | Trình xác thực nhận phí ưu tiên (mẹo) ¹ | Trình xác thực nhận 50% phí cơ sở và 100% phí ưu tiên ² | **Trình xác thực 30 · Cộng đồng 25 · Kho tài sản 20 · Tính thanh khoản 10 · Tăng trưởng 15** |
| Tài trợ sớm | Bán ether công cộng, 2014 (42 ngày, trả bằng BTC) ³ | $20M Series A do Multicoin Capital dẫn đầu (2019); nhà đầu tư nhận được token SOL ⁴ | **Tự trợ cấp. Không VC, không phân bổ nhà đầu tư** |
| Tạo tài khoản | Tạo một tài khoản không tốn chi phí; không kiểm tra danh tính ⁵ | Không phải yêu cầu giao thức | **Phần thưởng chỉ cho những con người được xác minh** |
| Chia sẻ cộng đồng token mới | Không phải quy tắc giao thức | Không phải quy tắc giao thức | **27% của mỗi token được phát hành** |

1. ethereum.org — Gas and fees: https://ethereum.org/en/developers/docs/gas/
2. solana.com — Fees: https://solana.com/docs/core/fees
3. ethereum.org — History (2014 Ether sale): https://ethereum.org/en/history/
4. Solana Labs, "Solana Completes $20 Million Raise Led by Multicoin Capital" (30 Jul 2019): https://medium.com/solana-labs/solana-completes-20-million-raise-led-by-multicoin-capital-3d7f939475b6 · CoinDesk (30 Jul 2019): https://www.coindesk.com/markets/2019/07/30/multicoin-leads-20-million-round-for-speed-focused-solana
5. ethereum.org — Accounts: https://ethereum.org/en/developers/docs/accounts/

*Các nguồn được kiểm tra vào tháng 10 năm 2026. "Không phải quy tắc/yêu cầu giao thức" có nghĩa là tài liệu được trích dẫn không mô tả quy tắc như vậy. Điều này so sánh các lựa chọn thiết kế, không phải chất lượng.*

---

## Liên kết

- Website: https://peopleblockchain.network
- Million Founders: https://peopleblockchain.network/founders
- Litepaper: https://peopleblockchain.network/litepaper
- Telegram: https://t.me/people_blockchain
- X: https://x.com/Peoplebchain
- YouTube: https://www.youtube.com/@PeoplesBlockchain

---

### Những gì đã thay đổi trong v1.1

- Phần cộng đồng của một token mới là **27%** nguồn cung: **10%** được phân bổ khi ra mắt cộng thêm **~16,7%** quét từ đường cong khi chuyển đổi.
- Vesting của đội ngũ là **0% khi ra mắt, cliff 6 tháng, sau đó 18 tháng tuyến tính** (tổng cộng 24 tháng).
- Phí khởi chạy: kế hoạch đã được phê duyệt là mức phí cố định **5 USD cho mỗi lần ra mắt token và 10 USD cho mỗi lần đúc NFT**, trả bằng PPL, USDT hoặc USDC, với ưu đãi 20% khi trả bằng PPL theo giá TWAP; các nhà máy đã triển khai vẫn thu phí PPL cố định.
- **Hiện tại không có đợt bán PPL công khai** và không thực hiện kiểm tra KYC hay điều kiện tham gia.
- Bảo mật: hiện là **đánh giá nội bộ có hỗ trợ của AI** và **kiểm toán độc lập trước mainnet**.
- Multisig của kho bạc là **2 trên 3** và được tạo trước mainnet.

export type ContractTemplateId =
  | "vesting"
  | "staking"
  | "airdrop"
  | "escrow"
  | "multisig"
  | "dao"
  | "timelock"
  | "crowdfund";

export interface ContractTemplate {
  id: ContractTemplateId;
  titleEn: string;
  titleRu: string;
  summaryEn: string;
  summaryRu: string;
  keywords: string[];
  fileName: string;
  /** Solidity 0.8.24, OpenZeppelin 5.x imports. */
  source: string;
  paramHintsEn: string[];
  paramHintsRu: string[];
}

const HEADER = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
`;

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    id: "vesting",
    titleEn: "Token vesting",
    titleRu: "Вестинг токенов",
    summaryEn: "Releases an ERC-20 balance to one beneficiary linearly over time. Owner can revoke unused tokens.",
    summaryRu: "Линейно выдаёт баланс ERC-20 одному получателю. Владелец может отозвать неразмороженное.",
    keywords: ["vest", "вестинг", "linear", "cliff", "размороз"],
    fileName: "LinearVesting.sol",
    paramHintsEn: ["ERC-20 token address", "beneficiary address", "duration in seconds"],
    paramHintsRu: ["Адрес ERC-20", "получатель", "длительность в секундах"],
    source: `${HEADER}import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract LinearVesting is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable beneficiary;
    uint256 public immutable start;
    uint256 public immutable duration;
    uint256 public immutable total;
    uint256 public released;

    constructor(address token_, address beneficiary_, uint256 duration_, uint256 total_) Ownable(msg.sender) {
        require(token_ != address(0) && beneficiary_ != address(0), "zero");
        require(duration_ > 0 && total_ > 0, "params");
        token = IERC20(token_);
        beneficiary = beneficiary_;
        start = block.timestamp;
        duration = duration_;
        total = total_;
    }

    function vested() public view returns (uint256) {
        if (block.timestamp < start) return 0;
        uint256 elapsed = block.timestamp - start;
        if (elapsed >= duration) return total;
        return (total * elapsed) / duration;
    }

    function releasable() public view returns (uint256) {
        return vested() - released;
    }

    function release() external nonReentrant {
        uint256 amount = releasable();
        require(amount > 0, "none");
        released += amount;
        token.safeTransfer(beneficiary, amount);
    }

    function revoke() external onlyOwner {
        uint256 leftover = token.balanceOf(address(this)) - releasable();
        if (leftover > 0) token.safeTransfer(owner(), leftover);
    }
}
`
  },
  {
    id: "staking",
    titleEn: "Token staking pool",
    titleRu: "Стейкинг-пул",
    summaryEn: "Users lock an ERC-20; the owner funds rewards from a separate ERC-20. No native PPL emission.",
    summaryRu: "Пользователи блокируют ERC-20; владелец фондирует награды другим ERC-20. Эмиссии PPL нет.",
    keywords: ["stake", "стейк", "farm", "reward", "наград"],
    fileName: "SimpleStaking.sol",
    paramHintsEn: ["Staking token", "reward token"],
    paramHintsRu: ["Токен стейка", "токен награды"],
    source: `${HEADER}import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SimpleStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable stakingToken;
    IERC20 public immutable rewardToken;
    uint256 public totalStaked;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public staked;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    constructor(address stakingToken_, address rewardToken_) Ownable(msg.sender) {
        require(stakingToken_ != address(0) && rewardToken_ != address(0), "zero");
        stakingToken = IERC20(stakingToken_);
        rewardToken = IERC20(rewardToken_);
    }

    function _update(address account) internal {
        if (account == address(0)) return;
        rewards[account] += (staked[account] * (rewardPerTokenStored - userRewardPerTokenPaid[account])) / 1e18;
        userRewardPerTokenPaid[account] = rewardPerTokenStored;
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "amount");
        _update(msg.sender);
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0 && staked[msg.sender] >= amount, "amount");
        _update(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
    }

    function fund(uint256 amount) external onlyOwner {
        require(totalStaked > 0, "empty");
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        rewardPerTokenStored += (amount * 1e18) / totalStaked;
    }

    function claim() external nonReentrant {
        _update(msg.sender);
        uint256 due = rewards[msg.sender];
        require(due > 0, "none");
        rewards[msg.sender] = 0;
        rewardToken.safeTransfer(msg.sender, due);
    }
}
`
  },
  {
    id: "airdrop",
    titleEn: "Owner airdrop",
    titleRu: "Раздача (airdrop)",
    summaryEn: "Owner sends an ERC-20 to many addresses in one call. Recipients do not pay the token transfer.",
    summaryRu: "Владелец рассылает ERC-20 списку адресов одним вызовом.",
    keywords: ["airdrop", "раздач", "drop", "merkle", "claim"],
    fileName: "BatchAirdrop.sol",
    paramHintsEn: ["ERC-20 token"],
    paramHintsRu: ["ERC-20 токен"],
    source: `${HEADER}import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BatchAirdrop is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;

    constructor(address token_) Ownable(msg.sender) {
        require(token_ != address(0), "zero");
        token = IERC20(token_);
    }

    function airdrop(address[] calldata recipients, uint256[] calldata amounts) external onlyOwner nonReentrant {
        require(recipients.length == amounts.length && recipients.length > 0, "len");
        for (uint256 i = 0; i < recipients.length; i++) {
            token.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
        }
    }
}
`
  },
  {
    id: "escrow",
    titleEn: "Simple escrow",
    titleRu: "Эскроу",
    summaryEn: "Buyer deposits ETH-like native value; seller and buyer must both confirm before release, or a timeout refunds the buyer.",
    summaryRu: "Покупатель вносит натив; выплата продавцу после двух подтверждений или возврат по таймеру.",
    keywords: ["escrow", "эскроу", "deposit", "hold", "условн"],
    fileName: "SimpleEscrow.sol",
    paramHintsEn: ["Seller address", "timeout seconds"],
    paramHintsRu: ["Продавец", "таймаут в секундах"],
    source: `${HEADER}import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SimpleEscrow is Ownable, ReentrancyGuard {
    address public immutable seller;
    uint256 public immutable timeout;
    address public buyer;
    uint256 public deposited;
    uint256 public deadline;
    bool public buyerOk;
    bool public sellerOk;

    constructor(address seller_, uint256 timeout_) Ownable(msg.sender) {
        require(seller_ != address(0) && timeout_ > 0, "params");
        seller = seller_;
        timeout = timeout_;
    }

    function deposit() external payable {
        require(buyer == address(0) && msg.value > 0, "open");
        buyer = msg.sender;
        deposited = msg.value;
        deadline = block.timestamp + timeout;
    }

    function confirm() external {
        if (msg.sender == buyer) buyerOk = true;
        else if (msg.sender == seller) sellerOk = true;
        else revert("who");
    }

    function release() external nonReentrant {
        require(buyerOk && sellerOk, "acks");
        uint256 amount = deposited;
        deposited = 0;
        (bool ok, ) = seller.call{value: amount}("");
        require(ok, "pay");
    }

    function refund() external nonReentrant {
        require(msg.sender == buyer && block.timestamp >= deadline, "wait");
        uint256 amount = deposited;
        deposited = 0;
        (bool ok, ) = buyer.call{value: amount}("");
        require(ok, "pay");
    }
}
`
  },
  {
    id: "multisig",
    titleEn: "N-of-M multisig",
    titleRu: "Мультиподпись N-из-M",
    summaryEn: "Owners submit and confirm transactions. Execution needs the threshold of confirmations.",
    summaryRu: "Владельцы подают и подтверждают транзакции. Исполнение после порога подписей.",
    keywords: ["multisig", "мультиподп", "threshold", "owners", "safe"],
    fileName: "SimpleMultisig.sol",
    paramHintsEn: ["Owner addresses", "threshold"],
    paramHintsRu: ["Адреса владельцев", "порог"],
    source: `${HEADER}contract SimpleMultisig {
    address[] public owners;
    mapping(address => bool) public isOwner;
    uint256 public immutable threshold;
    struct Proposal { address to; uint256 value; bytes data; uint256 confirmations; bool executed; }
    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) public confirmed;

    constructor(address[] memory owners_, uint256 threshold_) {
        require(owners_.length >= threshold_ && threshold_ > 0, "th");
        for (uint256 i = 0; i < owners_.length; i++) {
            require(owners_[i] != address(0) && !isOwner[owners_[i]], "own");
            isOwner[owners_[i]] = true;
            owners.push(owners_[i]);
        }
        threshold = threshold_;
    }

    receive() external payable {}

    function submit(address to, uint256 value, bytes calldata data) external returns (uint256 id) {
        require(isOwner[msg.sender], "owner");
        id = proposals.length;
        proposals.push(Proposal(to, value, data, 0, false));
        confirm(id);
    }

    function confirm(uint256 id) public {
        require(isOwner[msg.sender] && !confirmed[id][msg.sender], "conf");
        confirmed[id][msg.sender] = true;
        proposals[id].confirmations += 1;
    }

    function execute(uint256 id) external {
        Proposal storage p = proposals[id];
        require(!p.executed && p.confirmations >= threshold, "ready");
        p.executed = true;
        (bool ok, ) = p.to.call{value: p.value}(p.data);
        require(ok, "call");
    }
}
`
  },
  {
    id: "dao",
    titleEn: "Token-weighted vote",
    titleRu: "Голосование DAO",
    summaryEn: "Holders of an ERC-20 vote yes/no on a proposal. If yes-votes reach a quorum, anyone may execute the call.",
    summaryRu: "Держатели ERC-20 голосуют за/против. При кворуме «за» любой может исполнить вызов.",
    keywords: ["dao", "vote", "голосов", "governor", "proposal"],
    fileName: "TokenVote.sol",
    paramHintsEn: ["Governance token", "quorum"],
    paramHintsRu: ["Токен голосования", "кворум"],
    source: `${HEADER}import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract TokenVote is Ownable {
    IERC20 public immutable token;
    uint256 public immutable quorum;
    uint256 public immutable votingPeriod;
    struct Proposal { address to; bytes data; uint256 start; uint256 yes; uint256 no; bool executed; mapping(address => bool) voted; }
    uint256 public proposalCount;
    mapping(uint256 => Proposal) private proposals;

    constructor(address token_, uint256 quorum_, uint256 votingPeriod_) Ownable(msg.sender) {
        require(token_ != address(0) && quorum_ > 0 && votingPeriod_ > 0, "params");
        token = IERC20(token_);
        quorum = quorum_;
        votingPeriod = votingPeriod_;
    }

    function propose(address to, bytes calldata data) external onlyOwner returns (uint256 id) {
        id = ++proposalCount;
        Proposal storage p = proposals[id];
        p.to = to;
        p.data = data;
        p.start = block.timestamp;
    }

    function vote(uint256 id, bool support) external {
        Proposal storage p = proposals[id];
        require(block.timestamp < p.start + votingPeriod && !p.voted[msg.sender], "vote");
        p.voted[msg.sender] = true;
        uint256 w = token.balanceOf(msg.sender);
        if (support) p.yes += w;
        else p.no += w;
    }

    function execute(uint256 id) external {
        Proposal storage p = proposals[id];
        require(block.timestamp >= p.start + votingPeriod && !p.executed && p.yes >= quorum && p.yes > p.no, "fail");
        p.executed = true;
        (bool ok, ) = p.to.call(p.data);
        require(ok, "call");
    }
}
`
  },
  {
    id: "timelock",
    titleEn: "Timelock",
    titleRu: "Таймлок",
    summaryEn: "Queues a call that can only execute after a delay. Owner may cancel before the due time.",
    summaryRu: "Ставит вызов в очередь; исполнение только после задержки. Владелец может отменить до срока.",
    keywords: ["timelock", "таймлок", "delay", "queue", "задерж"],
    fileName: "SimpleTimelock.sol",
    paramHintsEn: ["Delay in seconds"],
    paramHintsRu: ["Задержка в секундах"],
    source: `${HEADER}import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract SimpleTimelock is Ownable {
    uint256 public immutable delay;
    mapping(bytes32 => uint256) public eta;

    constructor(uint256 delay_) Ownable(msg.sender) {
        require(delay_ > 0, "delay");
        delay = delay_;
    }

    function queue(address to, uint256 value, bytes calldata data) external onlyOwner returns (bytes32 id) {
        id = keccak256(abi.encode(to, value, data, block.timestamp));
        eta[id] = block.timestamp + delay;
    }

    function cancel(bytes32 id) external onlyOwner {
        eta[id] = 0;
    }

    function execute(bytes32 id, address to, uint256 value, bytes calldata data, uint256 queuedAt) external {
        bytes32 check = keccak256(abi.encode(to, value, data, queuedAt));
        require(check == id && eta[id] != 0 && block.timestamp >= eta[id], "eta");
        eta[id] = 0;
        (bool ok, ) = to.call{value: value}(data);
        require(ok, "call");
    }
}
`
  },
  {
    id: "crowdfund",
    titleEn: "Crowdfund with refund",
    titleRu: "Сбор средств с возвратом",
    summaryEn: "Collects native coin toward a goal before a deadline. If the goal is reached the owner claims the funds once; if not, every contributor can take their money back.",
    summaryRu: "Собирает натив до дедлайна. Если цель достигнута, владелец один раз забирает сумму; если нет, каждый участник может вернуть свои деньги.",
    keywords: [
      "crowdfund", "crowdfunding", "fundraise", "fundraising", "raise money", "raise funds", "goal", "refund", "donate", "donation", "pledge",
      "краудфанд", "сбор денег", "сбор средств", "собрать", "возврат", "пожертвов", "фандрайз", "цель сбора"
    ],
    fileName: "SimpleCrowdfund.sol",
    paramHintsEn: ["Funding goal in PPL", "campaign duration in days"],
    paramHintsRu: ["Цель сбора в PPL", "длительность сбора в днях"],
    source: `${HEADER}import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract SimpleCrowdfund is Ownable, ReentrancyGuard {
    uint256 public immutable goal;
    uint256 public immutable deadline;
    uint256 public raised;
    bool public claimed;
    mapping(address => uint256) public contributions;

    constructor(uint256 goal_, uint256 duration_) Ownable(msg.sender) {
        require(goal_ > 0 && duration_ > 0, "params");
        goal = goal_;
        deadline = block.timestamp + duration_;
    }

    function contribute() external payable {
        require(block.timestamp < deadline && !claimed && msg.value > 0, "closed");
        contributions[msg.sender] += msg.value;
        raised += msg.value;
    }

    function goalReached() public view returns (bool) {
        return raised >= goal;
    }

    function claim() external onlyOwner nonReentrant {
        require(goalReached() && !claimed, "goal");
        claimed = true;
        (bool ok, ) = owner().call{value: address(this).balance}("");
        require(ok, "pay");
    }

    function refund() external nonReentrant {
        require(block.timestamp >= deadline && !goalReached(), "wait");
        uint256 amount = contributions[msg.sender];
        require(amount > 0, "none");
        contributions[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "pay");
    }
}
`
  }
];

export function findTemplateById(id: string): ContractTemplate | undefined {
  return CONTRACT_TEMPLATES.find((item) => item.id === id);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Latin keywords match at a word start (so "vest" does not hit "invest"); Cyrillic keywords are stems. */
function keywordHits(text: string, word: string): boolean {
  const kw = word.toLowerCase();
  if (/^[a-z0-9 -]+$/.test(kw)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(kw)}`).test(text);
  }
  return text.includes(kw);
}

export function matchTemplate(prompt: string): ContractTemplate {
  const text = prompt.toLowerCase();
  let best = CONTRACT_TEMPLATES[0]!;
  let score = 0;
  for (const template of CONTRACT_TEMPLATES) {
    const hits = template.keywords.filter((word) => keywordHits(text, word)).length;
    if (hits > score) {
      score = hits;
      best = template;
    }
  }
  return best;
}

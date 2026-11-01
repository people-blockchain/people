/** Genesis Quest UI copy (English only). */

export const GENESIS_QUEST_COPY = {
  title: "Genesis Quest",
  lead: "Complete social tasks before 30 November 2026, 23:59 UTC. Quest points convert to locked PPL at a fixed rate after the snapshot.",
  questPointsLabel: "Quest points",
  founderPointsNote: "Founder points from daily on-site actions stay in a separate counter.",
  capNote: "Fixed rate: 1 quest point = 1 PPL, up to 5,000 PPL per person.",
  oversubNote:
    "If more is earned than a quest pool holds, everyone's reward from that pool is reduced proportionally.",
  progressLabel: "Progress to cap",
  projectedPpl: "Estimated locked reward PPL",
  vestingNote: "Locked on 1 December 2026. Nothing transferable until 1 March 2027, then 1/9 unlocks each month through 1 December 2027.",
  leaderboardNote: "Leaderboard ranks are subject to Sybil review before rewards are credited.",
  verifyRequired: "Verify with Telegram or Human Passport before rewards can be paid at the snapshot.",
  tasks: {
    verify: { title: "Verify on /founders", points: "1,000", done: "Completed" },
    founder_card: { title: "Get your Founder card", points: "500", done: "Completed" },
    telegram: {
      title: "Join the Telegram channel",
      points: "300",
      cta: "Check membership",
      hint: "Use the same Telegram account you verified with PeopleVerifyBot.",
    },
    x_link: {
      title: "Link X and reply with your code",
      points: "300",
      handleLabel: "Your X handle",
      saveHandle: "Save handle",
      replyLabel: "Reply URL (post of the day)",
      submit: "Submit reply",
      codeLabel: "Your personal code",
    },
    x_daily: {
      title: "Daily repost or reply on X",
      points: "100 / day",
      replyLabel: "Today's reply URL",
      submit: "Submit daily reply",
    },
    x_card: {
      title: "Share your Founder card on X",
      points: "500",
      cta: "Share on X",
      afterShare: "I shared — claim points",
    },
    youtube: {
      title: "YouTube weekly word",
      points: "200",
      label: "Secret word from the video",
      submit: "Submit word",
    },
    medium: {
      title: "Medium article code",
      points: "100",
      label: "Code word from the article",
      submit: "Submit word",
    },
  },
  referralTitle: "Verified invitees (Genesis referrals)",
  referralCap: "Up to 50 verified friends × 1,000 PPL each (bucket B).",
  leaderboardTitle: "Top founders by verified referrals",
  rulesTitle: "Genesis Quest rules",
  rulesBody: `Genesis Quest runs until 30 November 2026, 23:59 UTC. Rewards are calculated after the snapshot and credited as locked PPL in PEOPLE mainnet on 1 December 2026.

Rewards pool: 50,000,000 PPL — quests (25M), referrals (15M), leaderboard (10M).

Only verified people (Telegram or Human Passport), one person, one account, one wallet. Fake or duplicate accounts are removed and their rewards are cancelled.

Locked PPL can be used on PEOPLE for site fees (for example token and NFT creation). Quest rewards cannot be sold back to the PEOPLE sale contract. Unlocked PPL can be transferred to other people once transfers open in the network.

PPL rewards are not an investment and carry no promised price, return or buyback. Participation is free. We will never ask for your seed phrase, private key, or a payment to claim rewards.`,
  error: {
    generic: "Could not complete this task. Try again later.",
    rate_limited: "One attempt per day for this task.",
    cap: "You reached the 5,000 quest point cap.",
    duplicate: "You already completed this task.",
    invalid: "Check your input and try again.",
  },
  success: "Points added to your quest balance.",
} as const;

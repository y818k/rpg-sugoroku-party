export type RoomPhase = "lobby" | "playing" | "finished";
export type Job = "adventurer" | "warrior" | "mage";
export type TileType = "empty" | "battle" | "treasure" | "event" | "start" | "village" | "boss" | "demon";
export type Rarity = "normal" | "rare" | "epic" | "legendary";
export type GearType = "weapon" | "armor" | "accessory";
export type ItemKey = "potion" | "hiPotion" | "ether" | "hiEther" | "warpStone" | "windFeather" | "luckyCharm";

export type Stats = {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  physical: number;
  magical: number;
  defense: number;
  level: number;
  exp: number;
  gold: number;
  score: number;
};

export type Gear = {
  id: string;
  name: string;
  type: GearType;
  rarity: Rarity;
  physical: number;
  magical: number;
  defense: number;
  value: number;
};

export type Item = {
  id: string;
  key: ItemKey;
  name: string;
  value: number;
};

export type Player = {
  id: string;
  name: string;
  slot: number;
  connected: boolean;
  isHost: boolean;
  job: Job;
  changedJob: boolean;
  position: number;
  revivePosition: number;
  skipTurns: number;
  nextRollBonus: number;
  nextRollPenalty: number;
  luckyCharm: boolean;
  stats: Stats;
  inventory: {
    weapons: Gear[];
    armors: Gear[];
    accessories: Gear[];
    items: Item[];
  };
  equipment: {
    weapon?: Gear;
    armor?: Gear;
    accessory?: Gear;
  };
  defeatedBosses: number[];
};

export type Tile = {
  id: string;
  type: TileType;
  label: string;
  stage: 0 | 1 | 2 | 3 | 4;
  route?: "A" | "B" | "C";
  recommendedLevel?: number;
};

export type Enemy = {
  id: string;
  name: string;
  kind: "mob" | "boss" | "demon";
  stage: number;
  hp: number;
  maxHp: number;
  mp: number;
  physical: number;
  magical: number;
  defense: number;
  exp: number;
  gold: number;
  score: number;
  recommendedLevel?: number;
};

export type CombatState = {
  playerId: string;
  enemy: Enemy;
  log: string[];
};

export type RoomNotice = {
  type: "battle" | "treasure" | "event" | "village" | "boss" | "system";
  title: string;
  body: string;
};

export type Room = {
  code: string;
  phase: RoomPhase;
  hostId: string;
  players: Player[];
  currentTurn: number;
  turnRolled: boolean;
  tiles: Tile[];
  combat?: CombatState;
  winnerId?: string;
  notice?: RoomNotice;
  logs: string[];
  eventHistory: string[];
  createdAt: number;
};

export const itemCatalog: Record<ItemKey, Omit<Item, "id"> & { description: string }> = {
  potion: { key: "potion", name: "回復薬", value: 30, description: "HPを50回復します。" },
  hiPotion: { key: "hiPotion", name: "上級回復薬", value: 90, description: "HPを全回復します。" },
  ether: { key: "ether", name: "魔力薬", value: 35, description: "MPを50回復します。" },
  hiEther: { key: "hiEther", name: "上級魔力薬", value: 95, description: "MPを全回復します。" },
  warpStone: { key: "warpStone", name: "ワープ石", value: 60, description: "最後に訪れた村へ戻ります。" },
  windFeather: { key: "windFeather", name: "疾風の羽", value: 70, description: "次のルーレット結果を+2します。" },
  luckyCharm: { key: "luckyCharm", name: "幸運のお守り", value: 80, description: "次の宝箱のレア率を上げます。" },
};

export const tileIcons: Record<TileType, string> = {
  empty: "・",
  battle: "👾",
  treasure: "🎁",
  event: "⚡",
  start: "S",
  village: "🏘️",
  boss: "👹",
  demon: "😈",
};

export const jobNames: Record<Job, string> = {
  adventurer: "冒険者",
  warrior: "戦士",
  mage: "魔法使い",
};

export const rarityNames: Record<Rarity, string> = {
  normal: "ノーマル",
  rare: "レア",
  epic: "エピック",
  legendary: "レジェンダリー",
};

export const gearTypeNames: Record<GearType, string> = {
  weapon: "武器",
  armor: "防具",
  accessory: "アクセサリー",
};

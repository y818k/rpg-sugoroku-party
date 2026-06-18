import {
  CombatState,
  Direction,
  Enemy,
  Gear,
  GearType,
  Item,
  ItemKey,
  Job,
  Player,
  Rarity,
  Room,
  RoomNotice,
  Stats,
  Tile,
  TileType,
  gearTypeNames,
  itemCatalog,
  jobNames,
  rarityNames,
} from "@/shared/game";
import { createId } from "@/shared/id";

export const rooms = new Map<string, Room>();

const stageLengths = [0, 20, 24, 28];
const recommendedLevels = { 1: 5, 2: 9, 3: 13, 4: 16 } as const;
const rarityScore: Record<Rarity, number> = { normal: 1, rare: 3, epic: 6, legendary: 10 };
const gearCaps: Record<GearType, "weapons" | "armors" | "accessories"> = {
  weapon: "weapons",
  armor: "armors",
  accessory: "accessories",
};

const eventPool = [
  ["merchantHelp", "旅の商人の荷車を助けた！50G獲得", "good"],
  ["lostWallet", "落とし物の財布を発見！100G獲得", "good"],
  ["royalLetter", "王国から感謝状を受け取った！150G獲得", "good"],
  ["hiddenChest", "隠された宝箱を発見！", "chest"],
  ["secretDepot", "冒険者の隠し倉庫を見つけた！", "chest"],
  ["swordLesson", "経験豊富な剣士に稽古をつけてもらった！経験値獲得", "good"],
  ["sageLesson", "賢者の教えを受けた！経験値獲得", "good"],
  ["hotSpring", "温泉を発見！HP全回復", "good"],
  ["manaSpring", "神秘の泉を発見！MP全回復", "good"],
  ["popShop", "旅の商人が現れた！回復薬をもらった", "good"],
  ["mushroom", "道端の怪しいキノコを食べた！次のターン休み", "rest"],
  ["lostCoins", "財布を落とした！50G失う", "bad"],
  ["bandits", "盗賊に襲われた！100G失う", "bad"],
  ["sprain", "足をくじいた！次回移動-2", "bad"],
  ["lostPath", "道に迷った！1〜3マス後退", "bad"],
  ["ambushDamage", "モンスターに奇襲された！HP20%減少", "bad"],
  ["cursedStatue", "呪われた石像を触った！MP20%減少", "bad"],
  ["brokenBridge", "橋が崩れた！少し戻された", "bad"],
  ["armyRaid", "魔王軍の襲撃！戦闘発生", "battle"],
  ["donation", "困っている冒険者に寄付した！他プレイヤーに50Gずつ配る", "good"],
  ["kingSupport", "王国から支援金！最下位が100G獲得", "interfere"],
  ["topRobbed", "盗賊団の襲撃！上位が100G失う", "interfere"],
  ["topSkip", "魔王軍の妨害！上位が次のターン休み", "restInterfere"],
  ["warpCircle", "謎のワープ魔法陣！ランダム地点へ移動", "bad"],
  ["ancientRuins", "古代遺跡を発見！宝箱または戦闘", "mixed"],
  ["goddess", "女神の祝福！ランダムなステータスが少し上昇", "good"],
  ["fairy", "迷子の妖精を助けた！アイテム獲得", "good"],
  ["smith", "鍛冶屋の弟子に出会った！武器を少し強化", "good"],
  ["armorer", "防具職人に助けられた！防具を少し強化", "good"],
  ["tailwind", "不思議な風が吹いた！次回ルーレット+1", "good"],
] as const;

const id = () => createId("game");
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const roll = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(list: T[]) => list[roll(0, list.length - 1)];
const ok = (message?: string) => ({ ok: true, message });
const fail = (message: string) => ({ ok: false, message });

export function createRoom(name: string, playerId?: string) {
  const code = uniqueCode();
  const hostId = playerId || id();
  const room: Room = {
    code,
    phase: "lobby",
    hostId,
    players: [createPlayer(hostId, name || "Host", 1, true)],
    currentTurn: 0,
    turnRolled: false,
    tiles: [],
    logs: ["ルームを作成しました。"],
    eventHistory: [],
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return { room, playerId: hostId };
}

export function joinRoom(roomCode: string, name: string, playerId?: string) {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) return fail("ルームが見つかりません。");
  if (room.phase !== "lobby" && !room.players.some((p) => p.id === playerId)) return fail("開始済みのルームです。");
  const returning = room.players.find((p) => p.id === playerId);
  if (returning) {
    returning.connected = true;
    if (name) returning.name = name;
    room.logs.unshift(`${returning.name} が再接続しました。`);
    return { ok: true, room, playerId: returning.id };
  }
  if (room.players.length >= 4) return fail("ルームは満員です。");
  const nextId = playerId || id();
  const player = createPlayer(nextId, name || `Player ${room.players.length + 1}`, room.players.length + 1, false);
  room.players.push(player);
  room.logs.unshift(`${player.name} が参加しました。`);
  return { ok: true, room, playerId: nextId };
}

export function startGame(roomCode: string, playerId: string) {
  const room = getRoom(roomCode);
  if (!room) return fail("ルームがありません。");
  if (room.hostId !== playerId) return fail("ホストだけが開始できます。");
  room.phase = "playing";
  room.tiles = generateMap();
  room.currentTurn = 0;
  room.turnRolled = false;
  room.pendingMove = undefined;
  room.logs.unshift("ゲーム開始！冒険者たちはスタート地点に立った。");
  beginTurn(room);
  return ok();
}

export function rollRoulette(roomCode: string, playerId: string) {
  const room = getRoom(roomCode);
  const player = getCurrentPlayer(room, playerId);
  if (!room || !player) return fail("今は操作できません。");
  if (room.combat) return fail("戦闘中です。");
  if (room.pendingMove) return fail("先に道を選んでください。");
  if (room.turnRolled) return fail("このターンはルーレット済みです。");

  const raw = roll(1, 6);
  const move = Math.max(1, raw + player.nextRollBonus - player.nextRollPenalty);
  player.nextRollBonus = 0;
  player.nextRollPenalty = 0;
  room.turnRolled = true;
  room.lastMovePath = [player.position];
  setActivity(room, "roll", `${player.name} がルーレットで ${raw} を出した。${move}マス進む。`, player, { roll: raw, move, path: room.lastMovePath });
  movePlayer(room, player, move);
  room.logs.unshift(`${player.name} のルーレットは ${raw}、${move} マス進んだ。`);

  if (!room.pendingMove) resolveLanding(room, player);
  if (!room.pendingMove && !room.combat && room.phase === "playing" && !shouldHoldTurn(room, player)) nextTurn(room);
  return ok();
}

export function chooseBranch(roomCode: string, playerId: string, choice: string) {
  const room = getRoom(roomCode);
  const player = getCurrentPlayer(room, playerId);
  if (!room || !player) return fail("今は操作できません。");

  const destination = Number(choice);
  if (Number.isNaN(destination)) return fail("選べない道です。");

  if (room.pendingMove?.playerId === playerId) {
    const option = room.pendingMove.options.find((entry) => entry.to === destination);
    if (!option) return fail("選べない道です。");
    const previous = room.pendingMove.from;
    const remaining = Math.max(0, room.pendingMove.remaining - 1);
    room.pendingMove = undefined;
    room.lastMovePath = [...(room.lastMovePath ?? []), option.to];
    player.position = option.to;
    room.logs.unshift(`${player.name} は ${option.label} を選んだ。`);
    setActivity(room, "branch", `${player.name} が分岐で ${option.label} を選んだ。残り${remaining}マス。`, player, { path: room.lastMovePath });
    room.notice = makeNotice("system", `${player.name} の道選択`, `${option.label}へ進みます。残り${remaining}マス。`, player);
    const resolvedStop = isStopTile(room.tiles[player.position]);
    if (resolvedStop) {
      resolveLanding(room, player);
    } else {
      movePlayer(room, player, remaining, previous);
    }
    if (!resolvedStop && !room.pendingMove) resolveLanding(room, player);
    if (!room.pendingMove && !room.combat && room.phase === "playing" && !shouldHoldTurn(room, player)) nextTurn(room);
    return ok();
  }

  const tile = room.tiles[player.position];
  if (!tile?.connections?.includes(destination)) return fail("選べない道です。");
  room.lastMovePath = [player.position, destination];
  player.position = destination;
  const selected = room.tiles[destination];
  room.logs.unshift(`${player.name} は ${selected.label} へ向かった。`);
  setActivity(room, "branch", `${player.name} が ${selected.label} へ向かった。`, player, { path: room.lastMovePath });
  room.notice = makeNotice(selected.type === "boss" ? "boss" : "system", `${player.name} の道選択`, `${selected.label}へ進みます。`, player);
  resolveLanding(room, player);
  if (!room.combat && room.phase === "playing" && !shouldHoldTurn(room, player)) nextTurn(room);
  return ok();
}

export function endTurn(roomCode: string, playerId: string) {
  const room = getRoom(roomCode);
  const player = getCurrentPlayer(room, playerId);
  if (!room || !player) return fail("今は操作できません。");
  if (room.combat) return fail("戦闘中です。");
  if (room.pendingMove) return fail("先に道を選んでください。");
  if (room.tiles[player.position]?.type === "village") {
    room.logs.unshift(`${player.name}は村での準備を終えた。`);
    setActivity(room, "village", `${player.name}は村での準備を終えた。`, player);
  }
  nextTurn(room);
  return ok();
}

export function useItem(roomCode: string, playerId: string, itemId: string) {
  const room = getRoom(roomCode);
  const player = room?.players.find((p) => p.id === playerId);
  if (!room || !player) return fail("プレイヤーが見つかりません。");
  const isCurrent = room.players[room.currentTurn]?.id === playerId;
  const inCombat = room.combat?.playerId === playerId;
  if (room.pendingMove && !inCombat) return fail("先に道を選んでください。");
  const index = player.inventory.items.findIndex((item) => item.id === itemId);
  if (index < 0) return fail("アイテムがありません。");
  const item = player.inventory.items[index];
  const recoveryKeys: ItemKey[] = ["potion", "hiPotion", "ether", "hiEther"];
  if (!isCurrent && !inCombat) return fail("自分のターンではありません。");
  if (inCombat && !recoveryKeys.includes(item.key)) return fail("このアイテムは戦闘中に使えません。");
  if (!inCombat && room.combat) return fail("他プレイヤーが戦闘中です。");
  if (item.key === "windFeather" && room.turnRolled) return fail("疾風の羽はルーレット前のみ使えます。");
  if (item.key === "warpStone" && inCombat) return fail("ワープ石は戦闘中に使えません。");

  if (item.key === "potion") player.stats.hp = clamp(player.stats.hp + 50, 0, player.stats.maxHp);
  if (item.key === "hiPotion") player.stats.hp = player.stats.maxHp;
  if (item.key === "ether") player.stats.mp = clamp(player.stats.mp + 50, 0, player.stats.maxMp);
  if (item.key === "hiEther") player.stats.mp = player.stats.maxMp;
  if (item.key === "warpStone") player.position = player.revivePosition;
  if (item.key === "windFeather") player.nextRollBonus += 2;
  if (item.key === "luckyCharm") player.luckyCharm = true;

  player.inventory.items.splice(index, 1);
  room.logs.unshift(`${player.name} は ${item.name} を使った。`);
  setActivity(room, "system", `${player.name} は ${item.name} を使った。`, player);
  room.notice = makeNotice("system", `${player.name} のアイテム使用`, `${item.name} を使った。`, player);
  return ok();
}

export function equipGear(roomCode: string, playerId: string, gearId: string) {
  const room = getRoom(roomCode);
  const player = room?.players.find((p) => p.id === playerId);
  if (!room || !player) return fail("プレイヤーが見つかりません。");
  if (room.pendingMove) return fail("先に道を選んでください。");
  const gear = allGear(player).find((g) => g.id === gearId);
  if (!gear) return fail("装備がありません。");
  if (player.equipment[gear.type]?.id === gear.id) return ok("すでに装備中です。");
  player.equipment[gear.type] = undefined;
  player.equipment[gear.type] = gear;
  room.logs.unshift(`${player.name} は ${gear.name} を装備した。`);
  setActivity(room, "system", `${player.name} は ${gear.name} を装備した。`, player);
  room.notice = makeNotice("system", `${player.name} の装備変更`, `${gear.name} を装備した。`, player);
  return ok();
}

export function combatCommand(roomCode: string, playerId: string, command: "attack" | "skill" | "item" | "run", itemId?: string) {
  const room = getRoom(roomCode);
  const player = room?.players.find((p) => p.id === playerId);
  if (!room || !player || !room.combat || room.combat.playerId !== playerId) return fail("戦闘中ではありません。");
  const combat = room.combat;
  const pStats = effectiveStats(player);

  if (command === "run" && combat.enemy.kind === "mob") {
    room.logs.unshift(`${player.name} は逃げた。`);
    room.combat = undefined;
    nextTurn(room);
    return ok();
  }

  if (command === "item" && itemId) {
    const used = useItem(roomCode, playerId, itemId);
    if (!used.ok) return used;
    combat.phase = "playerAction";
    combat.lastAction = `${player.name} がアイテムを使った。`;
    combat.updatedAt = Date.now();
    enemyTurn(room, player, combat);
    return ok();
  }

  const skill = skillFor(player.job);
  let damage = calculateDamage(pStats.physical, combat.enemy.defense, 1, 0.55, 2);
  if (command === "skill") {
    if (player.stats.mp < skill.mp) return fail("MPが足りません。");
    player.stats.mp -= skill.mp;
    const atk = skill.type === "physical" ? pStats.physical : pStats.magical;
    damage = calculateDamage(atk, combat.enemy.defense, skill.multiplier, 0.55, 2);
  }

  combat.enemy.hp = clamp(combat.enemy.hp - damage, 0, combat.enemy.maxHp);
  combat.log.unshift(`${command === "skill" ? skill.name : "攻撃"}！${combat.enemy.name} に ${damage} ダメージ。`);
  combat.phase = "playerAction";
  combat.lastAction = `${player.name} の${command === "skill" ? skill.name : "攻撃"}。${combat.enemy.name} に ${damage} ダメージ。`;
  combat.updatedAt = Date.now();
  setActivity(room, "battle", combat.lastAction, player);
  if (combat.enemy.hp <= 0) {
    winCombat(room, player, combat.enemy);
    return ok();
  }

  enemyTurn(room, player, combat);
  return ok();
}

export function recoverAtVillage(roomCode: string, playerId: string) {
  const room = getRoom(roomCode);
  const player = room?.players.find((p) => p.id === playerId);
  if (!room || !player || room.tiles[player.position]?.type !== "village") return fail("村にいません。");
  if (room.pendingMove) return fail("先に道を選んでください。");
  player.stats.hp = player.stats.maxHp;
  player.stats.mp = player.stats.maxMp;
  player.revivePosition = player.position;
  room.logs.unshift(`${player.name}は村で回復した。`);
  setActivity(room, "village", `${player.name}は村で回復した。`, player);
  room.notice = makeNotice("village", `${player.name} の村行動`, "HP/MPを全回復した。", player);
  return ok();
}

export function buyShopItem(roomCode: string, playerId: string, itemKey: ItemKey) {
  const room = getRoom(roomCode);
  const player = room?.players.find((p) => p.id === playerId);
  const catalog = itemCatalog[itemKey];
  if (room?.pendingMove) return fail("先に道を選んでください。");
  if (!room || !player || !catalog || room.tiles[player.position]?.type !== "village") return fail("購入できません。");
  if (player.inventory.items.length >= 10) return fail("アイテムがいっぱいです。");
  if (player.stats.gold < catalog.value) return fail("ゴールドが足りません。");
  player.stats.gold -= catalog.value;
  player.inventory.items.push({ id: id(), key: catalog.key, name: catalog.name, value: catalog.value });
  room.logs.unshift(`${player.name}は${catalog.name}を購入した。`);
  setActivity(room, "village", `${player.name}は${catalog.name}を購入した。`, player);
  room.notice = makeNotice("village", `${player.name} のショップ`, `${catalog.name}を購入した。`, player);
  return ok();
}

export function sellInventory(roomCode: string, playerId: string, itemOrGearId: string) {
  const room = getRoom(roomCode);
  if (room?.pendingMove) return fail("先に道を選んでください。");
  const player = room?.players.find((p) => p.id === playerId);
  if (!room || !player || room.tiles[player.position]?.type !== "village") return fail("売却できません。");
  for (const key of ["weapons", "armors", "accessories", "items"] as const) {
    const list = player.inventory[key];
    const index = list.findIndex((entry) => entry.id === itemOrGearId);
    if (index >= 0) {
      const [sold] = list.splice(index, 1);
      if ("type" in sold && player.equipment[sold.type]?.id === sold.id) player.equipment[sold.type] = undefined;
      const value = "type" in sold ? sold.value : Math.floor(sold.value / 2);
      player.stats.gold += value;
      room.logs.unshift(`${player.name}は${sold.name}を${value}Gで売却した。`);
      setActivity(room, "village", `${player.name}は${sold.name}を${value}Gで売却した。`, player);
      room.notice = makeNotice("village", `${player.name} の売却`, `${sold.name}を${value}Gで売却した。`, player);
      return ok();
    }
  }
  return fail("売却対象がありません。");
}

export function changeJob(roomCode: string, playerId: string, job: Job) {
  const room = getRoom(roomCode);
  if (room?.pendingMove) return fail("先に道を選んでください。");
  const player = room?.players.find((p) => p.id === playerId);
  if (!room || !player || room.tiles[player.position]?.type !== "village" || room.tiles[player.position].stage !== 1) return fail("村1でのみ転職できます。");
  if (player.changedJob) return fail("転職済みです。");

  if (job === "warrior") {
    player.stats.maxHp += 30;
    player.stats.hp += 30;
    player.stats.physical += 10;
    player.stats.maxMp = Math.max(1, player.stats.maxMp - 10);
    player.stats.mp = Math.min(player.stats.mp, player.stats.maxMp);
  }
  if (job === "mage") {
    player.stats.maxMp += 30;
    player.stats.mp += 30;
    player.stats.magical += 10;
    player.stats.maxHp = Math.max(1, player.stats.maxHp - 10);
    player.stats.hp = Math.min(player.stats.hp, player.stats.maxHp);
  }

  player.job = job;
  player.changedJob = true;
  room.logs.unshift(`${player.name}は${jobNames[job]}に転職した。`);
  setActivity(room, "village", `${player.name}は${jobNames[job]}に転職した。`, player);
  room.notice = makeNotice("village", `${player.name} の転職`, `${jobNames[job]}に転職した。`, player);
  return ok();
}

export function disconnectPlayer(roomCode: string, playerId: string) {
  const room = getRoom(roomCode);
  const player = room?.players.find((p) => p.id === playerId);
  if (room && player) {
    player.connected = false;
    room.logs.unshift(`${player.name} が切断しました。`);
  }
}

export function getPublicRoom(roomCode: string) {
  return getRoom(roomCode);
}

function uniqueCode() {
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[roll(0, 31)]).join("");
  } while (rooms.has(code));
  return code;
}

function makeNotice(type: RoomNotice["type"], title: string, body: string, player: Player): RoomNotice {
  return { type, title, body, playerId: player.id, playerName: player.name };
}

function setActivity(
  room: Room,
  kind: NonNullable<Room["activity"]>["kind"],
  text: string,
  player?: Player,
  extra: Partial<Pick<NonNullable<Room["activity"]>, "path" | "roll" | "move">> = {},
) {
  room.activity = {
    kind,
    text,
    playerId: player?.id,
    playerName: player?.name,
    createdAt: Date.now(),
    ...extra,
  };
}

function createPlayer(playerId: string, name: string, slot: number, isHost: boolean): Player {
  const stats: Stats = { hp: 100, maxHp: 100, mp: 40, maxMp: 40, physical: 12, magical: 12, defense: 8, level: 1, exp: 0, gold: 120, score: 0 };
  const weapon = makeGear(1, "weapon", "normal", 7);
  const armor = makeGear(1, "armor", "normal", 7);
  return {
    id: playerId,
    name,
    slot,
    connected: true,
    isHost,
    job: "adventurer",
    changedJob: false,
    position: 0,
    revivePosition: 0,
    skipTurns: 0,
    nextRollBonus: 0,
    nextRollPenalty: 0,
    luckyCharm: false,
    stats,
    inventory: {
      weapons: [weapon],
      armors: [armor],
      accessories: [],
      items: [makeItem("potion"), makeItem("ether"), makeItem("windFeather")],
    },
    equipment: { weapon, armor },
    defeatedBosses: [],
  };
}

function generateMap(): Tile[] {
  const tiles: Tile[] = [{ id: id(), type: "start", label: "スタート", stage: 0, x: 50, y: 92 }];
  let previousExit = 0;
  for (const stage of [1, 2, 3] as const) {
    const stageMap = addIslandStage(tiles, stage);
    connectOneWay(tiles, previousExit, stageMap.entry, `ステージ${stage}へ`);
    previousExit = stageMap.village;
  }
  const castleStart = addTile(tiles, { type: "battle", label: "魔王城入口", stage: 4, x: 50, y: 84 });
  connectOneWay(tiles, previousExit, castleStart, "魔王城へ");
  let last = castleStart;
  const castleNodes = [
    { type: "event" as TileType, label: "魔王城回廊", x: 28, y: 62 },
    { type: "treasure" as TileType, label: "封印の宝物庫", x: 72, y: 62 },
    { type: "battle" as TileType, label: "魔王軍精鋭", x: 36, y: 38 },
    { type: "battle" as TileType, label: "玉座前", x: 64, y: 34 },
  ];
  castleNodes.forEach((node) => {
    const next = addTile(tiles, { ...node, stage: 4 });
    connectOneWay(tiles, last, next, node.label);
    last = next;
  });
  const demon = addTile(tiles, { type: "demon", label: "魔王", stage: 4, recommendedLevel: recommendedLevels[4], x: 50, y: 12 });
  connectOneWay(tiles, last, demon, `魔王へ：推奨Lv${recommendedLevels[4]}`);
  return tiles;
}

function addIslandStage(tiles: Tile[], stage: 1 | 2 | 3) {
  const layout = stageGridLayout(stage);
  const byKey = new Map<string, number>();
  layout.forEach((cell, index) => {
    const type = cell.type ?? (index === 0 ? "junction" : randomTile(stage));
    const tileIndex = addTile(tiles, {
      type,
      label: cell.label ?? `S${stage}-${index + 1}`,
      stage,
      route: cell.route ?? "grid",
      recommendedLevel: type === "boss" ? recommendedLevels[stage] : undefined,
      terrain: "road",
      passable: true,
      stoppable: true,
      gridX: cell.x,
      gridY: cell.y,
      x: gridToPercent(cell.x, 10),
      y: gridToPercent(cell.y, 6),
    });
    byKey.set(`${cell.x},${cell.y}`, tileIndex);
  });

  layout.forEach((cell) => {
    const from = byKey.get(`${cell.x},${cell.y}`);
    if (from === undefined) return;
    const neighbors: Array<[number, number, Direction]> = [
      [cell.x, cell.y - 1, "up"],
      [cell.x, cell.y + 1, "down"],
      [cell.x - 1, cell.y, "left"],
      [cell.x + 1, cell.y, "right"],
    ];
    neighbors.forEach(([x, y]) => {
      const to = byKey.get(`${x},${y}`);
      if (to === undefined) return;
      const fromTile = tiles[from];
      const toTile = tiles[to];
      if (fromTile.type === "village") return;
      if (fromTile.type === "boss") {
        if (toTile.type === "village") connectOneWay(tiles, from, to);
        return;
      }
      if (toTile.type === "village") {
        connectOneWay(tiles, from, to);
        return;
      }
      if (toTile.type === "boss") {
        connectOneWay(tiles, from, to, `中ボスへ：推奨Lv${recommendedLevels[stage]}`);
        return;
      }
      connectTwoWay(tiles, from, to);
    });
  });

  const entry = byKey.get("5,6");
  const village = [...byKey.values()].find((index) => tiles[index].type === "village");
  if (entry === undefined || village === undefined || !validateStageConnectivity(tiles, entry, village, stage)) {
    throw new Error(`Invalid generated stage ${stage}`);
  }
  return { entry, village };
}

function addRandomTiles(tiles: Tile[], stage: 1 | 2 | 3, count: number, route: string) {
  for (let i = 1; i <= count; i++) {
    tiles.push({ id: id(), type: randomTile(stage), label: `${route}${i}`, stage, route: pick(["A", "B", "C"]) });
  }
}

function stageGridLayout(stage: 1 | 2 | 3) {
  const base: Array<{ x: number; y: number; type?: TileType; label?: string; route?: string }> = [
    { x: 5, y: 6, type: "junction", label: `ステージ${stage}入口` },
    { x: 5, y: 5, type: "battle" },
    { x: 4, y: 5, type: "treasure", route: "reward" },
    { x: 6, y: 5, type: "event", route: "reward" },
    { x: 4, y: 4 },
    { x: 5, y: 4 },
    { x: 6, y: 4 },
    { x: 3, y: 4, type: "battle" },
    { x: 7, y: 4, type: "treasure", route: "reward" },
    { x: 3, y: 3, type: "event" },
    { x: 4, y: 3 },
    { x: 5, y: 3, type: "junction" },
    { x: 6, y: 3 },
    { x: 7, y: 3, type: "battle" },
    { x: 4, y: 2, type: "treasure", route: "reward" },
    { x: 5, y: 2 },
    { x: 6, y: 2, type: "event" },
    { x: 5, y: 1, type: "junction", label: `中ボス方面${stage}` },
    { x: 6, y: 1, type: "boss", label: `中ボス${stage}` },
    { x: 7, y: 1, type: "village", label: `村${stage}` },
  ];
  if (stage >= 2) {
    base.push({ x: 2, y: 3, type: "treasure", route: "reward" }, { x: 8, y: 3, type: "event", route: "reward" }, { x: 8, y: 2, type: "battle" }, { x: 3, y: 2, type: "battle" });
  }
  if (stage >= 3) {
    base.push({ x: 2, y: 4, type: "event", route: "reward" }, { x: 8, y: 4, type: "treasure", route: "reward" }, { x: 2, y: 2, type: "battle" }, { x: 8, y: 1, type: "treasure", route: "reward" });
  }
  return base.map((cell, index) => ({ ...cell, label: cell.label ?? `S${stage}-${index + 1}` }));
}

function gridToPercent(value: number, max: number) {
  return Math.round(((value - 0.5) / max) * 100);
}

function directionBetween(from: Tile, to: Tile): Direction | undefined {
  if (from.gridX === undefined || from.gridY === undefined || to.gridX === undefined || to.gridY === undefined) return undefined;
  if (to.gridX === from.gridX && to.gridY === from.gridY - 1) return "up";
  if (to.gridX === from.gridX && to.gridY === from.gridY + 1) return "down";
  if (to.gridX === from.gridX - 1 && to.gridY === from.gridY) return "left";
  if (to.gridX === from.gridX + 1 && to.gridY === from.gridY) return "right";
  return undefined;
}

function validateStageConnectivity(tiles: Tile[], entry: number, target: number, stage: number) {
  const stageIndexes = new Set(tiles.map((tile, index) => tile.stage === stage ? index : -1).filter((index) => index >= 0));
  const visited = new Set<number>();
  const queue = [entry];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    (tiles[current].connections ?? []).forEach((next) => {
      if (stageIndexes.has(next) && tiles[next].passable !== false && !visited.has(next)) queue.push(next);
    });
  }
  if (!visited.has(target)) return false;
  return [...stageIndexes].every((index) => {
    const tile = tiles[index];
    if (tile.passable === false) return true;
    if (tile.stoppable !== false && !(tile.connections?.length) && tile.type !== "village" && tile.type !== "demon") return false;
    return visited.has(index);
  });
}

function addTile(tiles: Tile[], tile: Omit<Tile, "id">) {
  tiles.push({ id: id(), passable: true, stoppable: true, terrain: "road", ...tile });
  return tiles.length - 1;
}

function connectOneWay(tiles: Tile[], from: number, to: number, label?: string) {
  const tile = tiles[from];
  if (!tile.connections) tile.connections = [];
  if (!tile.connectionLabels) tile.connectionLabels = [];
  if (!tile.connectionDirections) tile.connectionDirections = [];
  if (tile.connections.includes(to)) return;
  tile.connections.push(to);
  tile.connectionLabels.push(label ?? `${tiles[to]?.label ?? "道"}へ`);
  const direction = directionBetween(tile, tiles[to]);
  if (direction) tile.connectionDirections.push(direction);
}

function connectTwoWay(tiles: Tile[], a: number, b: number, labelAB?: string, labelBA?: string) {
  connectOneWay(tiles, a, b, labelAB ?? `${tiles[b]?.label ?? "道"}へ`);
  connectOneWay(tiles, b, a, labelBA ?? `${tiles[a]?.label ?? "道"}へ`);
}

function randomTile(stage: 1 | 2 | 3): TileType {
  const r = Math.random();
  if (stage === 1) return r < 0.5 ? "battle" : r < 0.73 ? "event" : r < 0.9 ? "treasure" : "empty";
  if (stage === 2) return r < 0.54 ? "battle" : r < 0.76 ? "event" : r < 0.96 ? "treasure" : "empty";
  return r < 0.58 ? "battle" : r < 0.78 ? "event" : r < 0.96 ? "treasure" : "empty";
}

function movePlayer(room: Room, player: Player, steps: number, previous?: number) {
  let remaining = steps;
  while (remaining > 0 && player.position < room.tiles.length - 1) {
    const options = getMoveOptions(room, player.position, remaining, previous);
    if (options.length > 1) {
      room.pendingMove = { playerId: player.id, remaining, from: player.position, options };
      room.notice = makeNotice("system", `${player.name} の分岐選択`, "道が分かれています。どちらへ進むか選んでください。", player);
      setActivity(room, "branch", `${player.name} が分岐で進路選択中。`, player, { path: room.lastMovePath });
      return;
    }
    const next = options[0]?.to ?? player.position + 1;
    previous = player.position;
    player.position = next;
    room.lastMovePath = [...(room.lastMovePath ?? []), player.position];
    remaining -= 1;
    setActivity(room, "move", `${player.name} が${steps - remaining}マス目へ進んだ。残り${remaining}マス。`, player, { path: room.lastMovePath });
    if (isStopTile(room.tiles[player.position])) break;
  }
}

function getMoveOptions(room: Room, position: number, remaining = 1, previous?: number) {
  const tile = room.tiles[position];
  const rawConnections = tile.connections?.length ? tile.connections : position < room.tiles.length - 1 ? [position + 1] : [];
  const rawOptions = rawConnections.map((to, index) => ({ to, label: tile.connectionLabels?.[index] ?? `${room.tiles[to]?.label ?? "道"}へ` }));
  const forwardOptions = rawOptions.filter((option) => option.to !== previous);
  const options = forwardOptions.length ? forwardOptions : rawOptions;
  return options.map(({ to, label }) => ({
    to,
    label,
    ...previewMove(room, position, to, remaining),
  }));
}

function previewMove(room: Room, from: number, to: number, remaining: number) {
  let current = to;
  let previous = from;
  let rest = Math.max(0, remaining - 1);
  const path = [to];
  while (rest > 0) {
    const tile = room.tiles[current];
    if (!tile || isStopTile(tile)) break;
    const raw = tile.connections?.length ? tile.connections : current < room.tiles.length - 1 ? [current + 1] : [];
    const forward = raw.filter((next) => next !== previous);
    const candidates = forward.length ? forward : raw;
    if (candidates.length !== 1) break;
    previous = current;
    current = candidates[0];
    path.push(current);
    rest -= 1;
  }
  const preview = room.tiles[current];
  return {
    previewType: preview?.type,
    previewLabel: preview?.label,
    previewPath: path,
  };
}

function resolveLanding(room: Room, player: Player) {
  const tile = room.tiles[player.position];
  if (tile.type === "battle") startCombat(room, player, makeEnemy(tile.stage, "mob"));
  if (tile.type === "treasure") openTreasure(room, player, tile.stage);
  if (tile.type === "event") resolveEvent(room, player);
  if (tile.type === "junction") {
    const options = getMoveOptions(room, player.position);
    if (options.length > 1) {
      room.pendingMove = { playerId: player.id, remaining: 0, from: player.position, options };
      room.notice = makeNotice("system", `${player.name} の分岐選択`, "道が分かれています。どちらへ進むか選んでください。", player);
    }
  }
  if (tile.type === "boss") {
    if (player.defeatedBosses.includes(tile.stage)) movePlayer(room, player, 1);
    else startCombat(room, player, makeEnemy(tile.stage, "boss"));
  }
  if (tile.type === "village") {
    player.revivePosition = player.position;
    player.stats.hp = player.stats.maxHp;
    player.stats.mp = player.stats.maxMp;
    room.logs.unshift(`${player.name} は ${tile.label} に到着した。`);
    setActivity(room, "village", `${player.name} は ${tile.label} に到着した。`, player, { path: room.lastMovePath });
    room.notice = makeNotice("village", `${player.name} の村到着`, "回復、ショップ、売却、転職、装備変更をしてからターン終了できます。", player);
  }
  if (tile.type === "demon") startCombat(room, player, makeEnemy(4, "demon"));
}

function isStopTile(tile: Tile | undefined) {
  return tile?.type === "village" || tile?.type === "boss" || tile?.type === "demon";
}

function startCombat(room: Room, player: Player, enemy: Enemy) {
  const levelText = enemy.recommendedLevel ? ` 推奨Lv${enemy.recommendedLevel}` : "";
  room.combat = { playerId: player.id, enemy, log: [`${enemy.name}${levelText} が現れた！`], phase: "idle", updatedAt: Date.now() };
  room.logs.unshift(`${player.name} は ${enemy.name}${levelText} と戦闘開始。`);
  setActivity(room, enemy.kind === "mob" ? "battle" : "battle", `${player.name} は ${enemy.name}${levelText} と戦闘中。`, player);
  room.notice = makeNotice(enemy.kind === "mob" ? "battle" : "boss", `${player.name} の戦闘`, `${enemy.name}${levelText} と戦闘中です。`, player);
}

function makeEnemy(stage: number, kind: Enemy["kind"]): Enemy {
  if (kind === "boss") {
    const recommendedLevel = recommendedLevels[stage as 1 | 2 | 3];
    return {
      id: id(),
      name: `中ボス${stage}`,
      kind,
      stage,
      hp: 120 + stage * 55,
      maxHp: 120 + stage * 55,
      mp: 20,
      physical: 26 + stage * 9,
      magical: 28 + stage * 12,
      defense: 10 + stage * 4,
      exp: 90 + stage * 50,
      gold: 0,
      score: 30,
      recommendedLevel,
    };
  }
  if (kind === "demon") {
    return { id: id(), name: "魔王", kind, stage, hp: 520, maxHp: 520, mp: 50, physical: 72, magical: 86, defense: 34, exp: 150, gold: 0, score: 100, recommendedLevel: recommendedLevels[4] };
  }
  const mobStats = stage <= 1
    ? { hp: 52, physical: 14, magical: 10, defense: 4 }
    : stage === 2
      ? { hp: 118, physical: 25, magical: 15, defense: 11 }
      : { hp: 170, physical: 36, magical: 22, defense: 18 };
  return { id: id(), name: `モンスター${stage}`, kind, stage, hp: mobStats.hp, maxHp: mobStats.hp, mp: 0, physical: mobStats.physical, magical: mobStats.magical, defense: mobStats.defense, exp: 25 + stage * 20, gold: 25 + stage * 25, score: 0 };
}

function enemyTurn(room: Room, player: Player, combat: CombatState) {
  const pStats = effectiveStats(player);
  const damage = calculateDamage(combat.enemy.physical, pStats.defense, 1, combat.enemy.kind === "mob" ? 0.45 : 0.55, combat.enemy.kind === "mob" ? 1 : 2);
  player.stats.hp = clamp(player.stats.hp - damage, 0, player.stats.maxHp);
  combat.log.unshift(`${combat.enemy.name} の攻撃。${player.name} は ${damage} ダメージ。`);
  combat.phase = "enemyAction";
  combat.lastAction = `${combat.enemy.name} の攻撃。${player.name} は ${damage} ダメージ。`;
  combat.updatedAt = Date.now();
  setActivity(room, "battle", combat.lastAction, player);
  if (player.stats.hp <= 0) {
    const lost = Math.floor(player.stats.gold * 0.1);
    player.stats.gold -= lost;
    player.position = player.revivePosition;
    player.stats.hp = Math.ceil(player.stats.maxHp / 2);
    room.logs.unshift(`${player.name} は倒れた。${lost}Gを失い復活地点へ戻った。`);
    room.notice = makeNotice("battle", `${player.name} の戦闘結果`, `戦闘不能。${lost}Gを失い復活地点へ戻った。`, player);
    room.combat = undefined;
    nextTurn(room);
  }
}

function calculateDamage(attack: number, defense: number, multiplier = 1, defenseRate = 0.55, minDamage = 1) {
  const base = attack * multiplier - defense * defenseRate;
  const randomMultiplier = 0.9 + Math.random() * 0.2;
  return Math.max(minDamage, Math.round(base * randomMultiplier));
}

function winCombat(room: Room, player: Player, enemy: Enemy) {
  player.stats.exp += enemy.exp;
  player.stats.gold += enemy.gold;
  player.stats.score += enemy.score;
  if (enemy.kind === "boss") {
    player.defeatedBosses.push(enemy.stage);
    if (!room.players.some((p) => p.id !== player.id && p.defeatedBosses.includes(enemy.stage))) player.stats.score += 10;
    room.logs.unshift(`${player.name} は 中ボス${enemy.stage} を倒した！スコア +${enemy.score}`);
    setActivity(room, "battle", `${player.name} は 中ボス${enemy.stage} を倒した。`, player);
    room.notice = makeNotice("boss", `${player.name} の中ボス結果`, `勝利！スコア+${enemy.score}。次の村へ進みます。`, player);
    movePlayer(room, player, 1);
    resolveLanding(room, player);
  } else if (enemy.kind === "demon") {
    player.stats.score += 100;
    room.phase = "finished";
    room.winnerId = player.id;
    finalizeScores(room);
    room.logs.unshift(`${player.name} が魔王を倒した！ゲーム終了。`);
    setActivity(room, "battle", `${player.name} が魔王を倒した。ゲーム終了。`, player);
    room.notice = makeNotice("boss", `${player.name} の魔王結果`, "魔王撃破！ゲーム終了。", player);
  } else {
    room.logs.unshift(`${player.name} は ${enemy.name} を倒した。`);
    setActivity(room, "battle", `${player.name} は ${enemy.name} を倒した。${enemy.exp}EXP と ${enemy.gold}G を獲得。`, player);
    room.notice = makeNotice("battle", `${player.name} の戦闘結果`, `勝利！${enemy.exp}EXP と ${enemy.gold}G を獲得。`, player);
    if (Math.random() < 0.2) giveDrop(room, player, enemy.stage);
  }
  levelUp(player, room);
  room.combat = undefined;
  if (room.phase === "playing" && !shouldHoldTurn(room, player)) nextTurn(room);
}

function openTreasure(room: Room, player: Player, stage: number) {
  const r = Math.random();
  if (r < 0.7) {
    const gear = makeGear(stage, pick(["weapon", "armor", "accessory"]), rollRarity(stage, player.luckyCharm));
    player.luckyCharm = false;
    addGear(room, player, gear);
    room.logs.unshift(`${player.name} は宝箱から ${gear.name} を得た。`);
    setActivity(room, "treasure", `${player.name} は宝箱から ${gear.name} を得た。`, player);
    room.notice = makeNotice("treasure", `${player.name} の宝箱結果`, `${gear.name} を入手した。${gearStats(gear)}`, player);
  } else if (r < 0.9) {
    const gold = 80 + stage * 40;
    player.stats.gold += gold;
    room.logs.unshift(`${player.name} は宝箱から ${gold}G を得た。`);
    setActivity(room, "treasure", `${player.name} は宝箱から ${gold}G を得た。`, player);
    room.notice = makeNotice("treasure", `${player.name} の宝箱結果`, `${gold}G を入手した。`, player);
  } else {
    const item = makeItem(pick(Object.keys(itemCatalog) as ItemKey[]));
    addItem(room, player, item);
    room.logs.unshift(`${player.name} は宝箱から ${item.name} を得た。`);
    setActivity(room, "treasure", `${player.name} は宝箱から ${item.name} を得た。`, player);
    room.notice = makeNotice("treasure", `${player.name} の宝箱結果`, `${item.name} を入手した。`, player);
  }
}

function resolveEvent(room: Room, player: Player) {
  let candidates = eventPool.filter(([key, , kind]) => !room.eventHistory.slice(0, 2).includes(key) && !(kind.includes("rest") && room.eventHistory[0] && eventPool.find((e) => e[0] === room.eventHistory[0])?.[2].includes("rest")));
  if (!candidates.length) candidates = [...eventPool];
  const [key, text, kind] = pick(candidates);
  room.eventHistory.unshift(key);
  room.eventHistory = room.eventHistory.slice(0, 4);
  room.logs.unshift(text);
  setActivity(room, "event", `${player.name} のイベント: ${text}`, player);
  room.notice = makeNotice("event", `${player.name} のイベント結果`, text, player);

  if (key === "merchantHelp") player.stats.gold += 50;
  if (key === "lostWallet") player.stats.gold += 100;
  if (key === "royalLetter") player.stats.gold += 150;
  if (kind === "chest") openTreasure(room, player, currentStage(room, player));
  if (key === "swordLesson" || key === "sageLesson") player.stats.exp += 30;
  if (key === "hotSpring") player.stats.hp = player.stats.maxHp;
  if (key === "manaSpring") player.stats.mp = player.stats.maxMp;
  if (key === "popShop") addItem(room, player, makeItem("potion"));
  if (key === "mushroom") player.skipTurns += 1;
  if (key === "lostCoins") player.stats.gold = Math.max(0, player.stats.gold - 50);
  if (key === "bandits") player.stats.gold = Math.max(0, player.stats.gold - 100);
  if (key === "sprain") player.nextRollPenalty += 2;
  if (key === "lostPath") player.position = Math.max(0, player.position - roll(1, 3));
  if (key === "ambushDamage") player.stats.hp = Math.max(1, player.stats.hp - Math.ceil(player.stats.maxHp * 0.2));
  if (key === "cursedStatue") player.stats.mp = Math.max(0, player.stats.mp - Math.ceil(player.stats.maxMp * 0.2));
  if (key === "brokenBridge") player.position = Math.max(0, player.position - 4);
  if (key === "armyRaid") startCombat(room, player, makeEnemy(currentStage(room, player), "mob"));
  if (key === "donation") room.players.filter((p) => p.id !== player.id).forEach((p) => (p.stats.gold += 50));
  if (key === "kingSupport") scoreSorted(room).at(-1)!.stats.gold += 100;
  if (key === "topRobbed") weightedTarget(room).stats.gold = Math.max(0, weightedTarget(room).stats.gold - 100);
  if (key === "topSkip") weightedTarget(room).skipTurns += 1;
  if (key === "warpCircle") player.position = roll(0, room.tiles.length - 2);
  if (key === "ancientRuins") Math.random() < 0.5 ? openTreasure(room, player, currentStage(room, player)) : startCombat(room, player, makeEnemy(currentStage(room, player), "mob"));
  if (key === "goddess") boostRandomStat(player);
  if (key === "fairy") addItem(room, player, makeItem(pick(Object.keys(itemCatalog) as ItemKey[])));
  if (key === "smith" && player.equipment.weapon) player.equipment.weapon.physical += 2;
  if (key === "armorer" && player.equipment.armor) player.equipment.armor.defense += 2;
  if (key === "tailwind") player.nextRollBonus += 1;
  levelUp(player, room);
}

function beginTurn(room: Room) {
  const player = room.players[room.currentTurn];
  room.turnRolled = false;
  room.pendingMove = undefined;
  room.notice = undefined;
  room.lastMovePath = undefined;
  if (player.skipTurns > 0) {
    player.skipTurns -= 1;
    room.logs.unshift(`${player.name}は体調不良で次のターンを休んだ。`);
    setActivity(room, "event", `${player.name}は体調不良で次のターンを休んだ。`, player);
    nextTurn(room);
    return;
  }
  room.logs.unshift(`${player.name} のターン。`);
  if (!room.activity || ["turn", "roll", "move", "branch", "system"].includes(room.activity.kind)) {
    setActivity(room, "turn", `${player.name} のターン。`, player);
  }
}

function nextTurn(room: Room) {
  if (room.phase !== "playing") return;
  room.currentTurn = (room.currentTurn + 1) % room.players.length;
  beginTurn(room);
}

function shouldHoldTurn(room: Room, player: Player) {
  const type = room.tiles[player.position]?.type;
  return type === "village" || type === "junction";
}

function getRoom(code: string) {
  return rooms.get(code?.toUpperCase());
}

function getCurrentPlayer(room: Room | undefined, playerId: string) {
  if (!room || room.phase !== "playing") return undefined;
  const player = room.players[room.currentTurn];
  return player?.id === playerId ? player : undefined;
}

function allGear(player: Player) {
  return [...player.inventory.weapons, ...player.inventory.armors, ...player.inventory.accessories];
}

function effectiveStats(player: Player) {
  const gear = Object.values(player.equipment);
  return {
    ...player.stats,
    physical: player.stats.physical + gear.reduce((sum, g) => sum + (g?.physical ?? 0), 0),
    magical: player.stats.magical + gear.reduce((sum, g) => sum + (g?.magical ?? 0), 0),
    defense: player.stats.defense + gear.reduce((sum, g) => sum + (g?.defense ?? 0), 0),
  };
}

function skillFor(job: Job) {
  if (job === "warrior") return { name: "強斬り", multiplier: 1.75, mp: 8, type: "physical" as const };
  if (job === "mage") return { name: "ファイア", multiplier: 2.0, mp: 15, type: "magical" as const };
  return { name: "連撃", multiplier: 1.35, mp: 8, type: "physical" as const };
}

function scoreSorted(room: Room) {
  return [...room.players].sort((a, b) => finalScore(b) - finalScore(a));
}

function weightedTarget(room: Room) {
  const sorted = scoreSorted(room);
  const r = Math.random();
  return sorted[r < 0.5 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : 3] ?? sorted[0];
}

function giveDrop(room: Room, player: Player, stage: number) {
  if (Math.random() < 0.45) addGear(room, player, makeGear(stage, pick(["weapon", "armor", "accessory"]), rollRarity(stage, false)));
  else addItem(room, player, makeItem(pick(Object.keys(itemCatalog) as ItemKey[])));
}

function addGear(room: Room, player: Player, gear: Gear) {
  const key = gearCaps[gear.type];
  if (player.inventory[key].length >= 5) {
    player.stats.gold += Math.floor(gear.value / 2);
    room.logs.unshift(`${player.name} の所持枠がいっぱいのため ${gear.name} を売却した。`);
  } else player.inventory[key].push(gear);
}

function addItem(room: Room, player: Player, item: Item) {
  if (player.inventory.items.length >= 10) {
    player.stats.gold += Math.floor(item.value / 2);
    room.logs.unshift(`${player.name} のアイテム枠がいっぱいのため ${item.name} を売却した。`);
  } else player.inventory.items.push(item);
}

function makeGear(stage: number, type: GearType, rarity: Rarity, base = 10 + stage * 5): Gear {
  const ranges: Record<Rarity, [number, number]> = { normal: [0.8, 1.2], rare: [1.2, 1.6], epic: [1.6, 2.2], legendary: [2.2, 3.0] };
  const [min, max] = ranges[rarity];
  const power = roll(Math.floor(base * min), Math.ceil(base * max));
  return {
    id: id(),
    name: `${rarityNames[rarity]}${gearTypeNames[type]}`,
    type,
    rarity,
    physical: type === "weapon" ? power : type === "accessory" ? Math.floor(power / 3) : 0,
    magical: type === "weapon" ? Math.floor(power / 2) : type === "accessory" ? Math.floor(power / 3) : 0,
    defense: type === "armor" ? power : type === "accessory" ? Math.floor(power / 3) : 0,
    value: rarityScore[rarity] * 100,
  };
}

function makeItem(key: ItemKey): Item {
  const catalog = itemCatalog[key];
  return { id: id(), key: catalog.key, name: catalog.name, value: catalog.value };
}

function rollRarity(stage: number, lucky: boolean): Rarity {
  const r = Math.random() - (lucky ? 0.18 : 0);
  if (stage <= 1) return r < 0.7 ? "normal" : r < 0.95 ? "rare" : "epic";
  if (stage === 2) return r < 0.4 ? "normal" : r < 0.8 ? "rare" : r < 0.98 ? "epic" : "legendary";
  return r < 0.2 ? "normal" : r < 0.6 ? "rare" : r < 0.9 ? "epic" : "legendary";
}

function levelUp(player: Player, room: Room) {
  const gained: number[] = [];
  while (player.stats.exp >= player.stats.level * 50) {
    player.stats.exp -= player.stats.level * 50;
    player.stats.level += 1;
    player.stats.maxHp += 10;
    player.stats.maxMp += 4;
    player.stats.physical += 3;
    player.stats.magical += 3;
    player.stats.defense += 2;
    player.stats.hp = player.stats.maxHp;
    player.stats.mp = player.stats.maxMp;
    room.logs.unshift(`${player.name} は Lv.${player.stats.level} になった。`);
    gained.push(player.stats.level);
  }
  if (gained.length && room.activity) {
    room.activity.text = `${room.activity.text} Lv${gained.join(" / Lv")} に上がった！`;
  }
}

function finalizeScores(room: Room) {
  room.players.forEach((p) => {
    p.stats.score = finalScore(p);
  });
}

function finalScore(player: Player) {
  const gearById = new Map<string, Gear>();
  [...player.inventory.weapons, ...player.inventory.armors, ...player.inventory.accessories, ...Object.values(player.equipment)]
    .filter(Boolean)
    .forEach((gear) => gearById.set(gear!.id, gear!));
  const gearScore = [...gearById.values()].reduce((sum, gear) => sum + rarityScore[gear.rarity], 0);
  return player.stats.score + player.stats.level * 2 + gearScore + Math.floor(player.stats.gold / 100);
}

function currentStage(room: Room, player: Player) {
  return Math.max(1, Math.min(3, room.tiles[player.position]?.stage || 1));
}

function boostRandomStat(player: Player) {
  const stat = pick(["maxHp", "maxMp", "physical", "magical", "defense"] as const);
  player.stats[stat] += stat === "maxHp" ? 10 : stat === "maxMp" ? 5 : 2;
  if (stat === "maxHp") player.stats.hp += 10;
  if (stat === "maxMp") player.stats.mp += 5;
}

function gearStats(gear: Gear) {
  return [gear.physical ? `物攻+${gear.physical}` : "", gear.magical ? `魔攻+${gear.magical}` : "", gear.defense ? `防御+${gear.defense}` : ""].filter(Boolean).join(" ");
}

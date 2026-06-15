import {
  CombatState,
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

const stageLengths = [0, 18, 22, 26];
const recommendedLevels = { 1: 5, 2: 9, 3: 13, 4: 16 } as const;
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
    const remaining = Math.max(0, room.pendingMove.remaining - 1);
    room.pendingMove = undefined;
    player.position = option.to;
    room.logs.unshift(`${player.name} は ${option.label} を選んだ。`);
    room.notice = makeNotice("system", `${player.name} の道選択`, `${option.label}へ進みます。残り${remaining}マス。`, player);
    movePlayer(room, player, remaining);
    if (!room.pendingMove) resolveLanding(room, player);
    if (!room.pendingMove && !room.combat && room.phase === "playing" && !shouldHoldTurn(room, player)) nextTurn(room);
    return ok();
  }

  const tile = room.tiles[player.position];
  if (!tile?.connections?.includes(destination)) return fail("選べない道です。");
  player.position = destination;
  const selected = room.tiles[destination];
  room.logs.unshift(`${player.name} は ${selected.label} へ向かった。`);
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
  }
  nextTurn(room);
  return ok();
}

export function useItem(roomCode: string, playerId: string, itemId: string) {
  const room = getRoom(roomCode);
  const player = room?.players.find((p) => p.id === playerId);
  if (!room || !player) return fail("プレイヤーが見つかりません。");
  const index = player.inventory.items.findIndex((item) => item.id === itemId);
  if (index < 0) return fail("アイテムがありません。");
  const item = player.inventory.items[index];

  if (item.key === "potion") player.stats.hp = clamp(player.stats.hp + 50, 0, player.stats.maxHp);
  if (item.key === "hiPotion") player.stats.hp = player.stats.maxHp;
  if (item.key === "ether") player.stats.mp = clamp(player.stats.mp + 50, 0, player.stats.maxMp);
  if (item.key === "hiEther") player.stats.mp = player.stats.maxMp;
  if (item.key === "warpStone") player.position = player.revivePosition;
  if (item.key === "windFeather") player.nextRollBonus += 2;
  if (item.key === "luckyCharm") player.luckyCharm = true;

  player.inventory.items.splice(index, 1);
  room.logs.unshift(`${player.name} は ${item.name} を使った。`);
  room.notice = makeNotice("system", `${player.name} のアイテム使用`, `${item.name} を使った。`, player);
  return ok();
}

export function equipGear(roomCode: string, playerId: string, gearId: string) {
  const room = getRoom(roomCode);
  const player = room?.players.find((p) => p.id === playerId);
  if (!room || !player) return fail("プレイヤーが見つかりません。");
  const gear = allGear(player).find((g) => g.id === gearId);
  if (!gear) return fail("装備がありません。");
  if (player.equipment[gear.type]?.id === gear.id) return ok("すでに装備中です。");
  player.equipment[gear.type] = undefined;
  player.equipment[gear.type] = gear;
  room.logs.unshift(`${player.name} は ${gear.name} を装備した。`);
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
    enemyTurn(room, player, combat);
    return ok();
  }

  const skill = skillFor(player.job);
  let damage = Math.max(1, pStats.physical - combat.enemy.defense);
  if (command === "skill") {
    if (player.stats.mp < skill.mp) return fail("MPが足りません。");
    player.stats.mp -= skill.mp;
    const atk = skill.type === "physical" ? pStats.physical : pStats.magical;
    damage = Math.max(1, Math.floor(atk * skill.multiplier - combat.enemy.defense));
  }

  combat.enemy.hp = clamp(combat.enemy.hp - damage, 0, combat.enemy.maxHp);
  combat.log.unshift(`${command === "skill" ? skill.name : "攻撃"}！${combat.enemy.name} に ${damage} ダメージ。`);
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
  player.stats.hp = player.stats.maxHp;
  player.stats.mp = player.stats.maxMp;
  player.revivePosition = player.position;
  room.logs.unshift(`${player.name}は村で回復した。`);
  room.notice = makeNotice("village", `${player.name} の村行動`, "HP/MPを全回復した。", player);
  return ok();
}

export function buyShopItem(roomCode: string, playerId: string, itemKey: ItemKey) {
  const room = getRoom(roomCode);
  const player = room?.players.find((p) => p.id === playerId);
  const catalog = itemCatalog[itemKey];
  if (!room || !player || !catalog || room.tiles[player.position]?.type !== "village") return fail("購入できません。");
  if (player.inventory.items.length >= 10) return fail("アイテムがいっぱいです。");
  if (player.stats.gold < catalog.value) return fail("ゴールドが足りません。");
  player.stats.gold -= catalog.value;
  player.inventory.items.push({ id: id(), key: catalog.key, name: catalog.name, value: catalog.value });
  room.logs.unshift(`${player.name}は${catalog.name}を購入した。`);
  room.notice = makeNotice("village", `${player.name} のショップ`, `${catalog.name}を購入した。`, player);
  return ok();
}

export function sellInventory(roomCode: string, playerId: string, itemOrGearId: string) {
  const room = getRoom(roomCode);
  const player = room?.players.find((p) => p.id === playerId);
  if (!room || !player || room.tiles[player.position]?.type !== "village") return fail("売却できません。");
  for (const key of ["weapons", "armors", "accessories", "items"] as const) {
    const list = player.inventory[key];
    const index = list.findIndex((entry) => entry.id === itemOrGearId);
    if (index >= 0) {
      const [sold] = list.splice(index, 1);
      if ("type" in sold && player.equipment[sold.type]?.id === sold.id) player.equipment[sold.type] = undefined;
      const value = Math.floor(sold.value / 2);
      player.stats.gold += value;
      room.logs.unshift(`${player.name}は${sold.name}を${value}Gで売却した。`);
      room.notice = makeNotice("village", `${player.name} の売却`, `${sold.name}を${value}Gで売却した。`, player);
      return ok();
    }
  }
  return fail("売却対象がありません。");
}

export function changeJob(roomCode: string, playerId: string, job: Job) {
  const room = getRoom(roomCode);
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
  const tiles: Tile[] = [{ id: id(), type: "start", label: "スタート", stage: 0 }];
  for (const stage of [1, 2, 3] as const) {
    addStage(tiles, stage);
  }
  tiles.push({ id: id(), type: "demon", label: "魔王", stage: 4, recommendedLevel: recommendedLevels[4] });
  return tiles;
}

function addStage(tiles: Tile[], stage: 1 | 2 | 3) {
  const entry = tiles.length;
  addRandomTiles(tiles, stage, Math.floor(stageLengths[stage] * 0.2), "中央");
  const routeSplit = addTile(tiles, { type: "junction", label: `分岐${stage}-A`, stage });
  const routeAStart = tiles.length;
  addRandomTiles(tiles, stage, Math.floor(stageLengths[stage] * 0.28), "宝箱方面");
  const routeAEnd = tiles.length - 1;
  const routeBStart = tiles.length;
  addRandomTiles(tiles, stage, Math.floor(stageLengths[stage] * 0.28), "戦闘方面");
  const routeBEnd = tiles.length - 1;
  const merge = addTile(tiles, { type: "empty", label: `合流${stage}`, stage });
  addRandomTiles(tiles, stage, Math.floor(stageLengths[stage] * 0.18), "外周");
  const bossSplit = addTile(tiles, { type: "junction", label: `中ボス分岐${stage}`, stage });
  const boss = addTile(tiles, { type: "boss", label: `中ボス${stage}`, stage, recommendedLevel: recommendedLevels[stage] });
  const village = addTile(tiles, { type: "village", label: `村${stage}`, stage });

  tiles[routeSplit].connections = [routeAStart, routeBStart];
  tiles[routeSplit].connectionLabels = ["左：宝箱方面", "右：戦闘方面"];
  tiles[routeAEnd].connections = [merge];
  tiles[routeBEnd].connections = [merge];
  tiles[bossSplit].connections = [entry, boss];
  tiles[bossSplit].connectionLabels = ["周回する：外周へ戻る", `中ボスへ向かう：推奨Lv${recommendedLevels[stage]}`];
  tiles[boss].connections = [village];
}

function addRandomTiles(tiles: Tile[], stage: 1 | 2 | 3, count: number, route: string) {
  for (let i = 1; i <= count; i++) {
    tiles.push({ id: id(), type: randomTile(stage), label: `${route}${i}`, stage, route: pick(["A", "B", "C"]) });
  }
}

function addTile(tiles: Tile[], tile: Omit<Tile, "id">) {
  tiles.push({ id: id(), ...tile });
  return tiles.length - 1;
}

function randomTile(stage: 1 | 2 | 3): TileType {
  const r = Math.random();
  if (stage === 1) return r < 0.5 ? "battle" : r < 0.73 ? "event" : r < 0.9 ? "treasure" : "empty";
  if (stage === 2) return r < 0.54 ? "battle" : r < 0.76 ? "event" : r < 0.96 ? "treasure" : "empty";
  return r < 0.58 ? "battle" : r < 0.78 ? "event" : r < 0.96 ? "treasure" : "empty";
}

function movePlayer(room: Room, player: Player, steps: number) {
  let remaining = steps;
  while (remaining > 0 && player.position < room.tiles.length - 1) {
    const options = getMoveOptions(room, player.position);
    if (options.length > 1) {
      room.pendingMove = { playerId: player.id, remaining, from: player.position, options };
      room.notice = makeNotice("system", `${player.name} の分岐選択`, "道が分かれています。どちらへ進むか選んでください。", player);
      return;
    }
    player.position = options[0]?.to ?? player.position + 1;
    remaining -= 1;
    const tile = room.tiles[player.position];
    if (tile.type === "village" || tile.type === "boss" || tile.type === "demon") break;
  }
}

function getMoveOptions(room: Room, position: number) {
  const tile = room.tiles[position];
  const connections = tile.connections?.length ? tile.connections : position < room.tiles.length - 1 ? [position + 1] : [];
  return connections.map((to, index) => ({
    to,
    label: tile.connectionLabels?.[index] ?? `${room.tiles[to]?.label ?? "道"}へ`,
  }));
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
    room.notice = makeNotice("village", `${player.name} の村到着`, "回復、ショップ、売却、転職、装備変更をしてからターン終了できます。", player);
  }
  if (tile.type === "demon") startCombat(room, player, makeEnemy(4, "demon"));
}

function startCombat(room: Room, player: Player, enemy: Enemy) {
  const levelText = enemy.recommendedLevel ? ` 推奨Lv${enemy.recommendedLevel}` : "";
  room.combat = { playerId: player.id, enemy, log: [`${enemy.name}${levelText} が現れた！`] };
  room.logs.unshift(`${player.name} は ${enemy.name}${levelText} と戦闘開始。`);
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
      hp: 175 + stage * 85,
      maxHp: 175 + stage * 85,
      mp: 20,
      physical: 34 + stage * 15,
      magical: 22 + stage * 10,
      defense: 14 + stage * 8,
      exp: 90 + stage * 50,
      gold: 0,
      score: 30,
      recommendedLevel,
    };
  }
  if (kind === "demon") {
    return { id: id(), name: "魔王", kind, stage, hp: 460, maxHp: 460, mp: 50, physical: 82, magical: 68, defense: 42, exp: 150, gold: 0, score: 100, recommendedLevel: recommendedLevels[4] };
  }
  const hp = 64 + stage * 34;
  return { id: id(), name: `モンスター${stage}`, kind, stage, hp, maxHp: hp, mp: 0, physical: 15 + stage * 9, magical: 6 + stage * 5, defense: 8 + stage * 5, exp: 25 + stage * 20, gold: 25 + stage * 25, score: 0 };
}

function enemyTurn(room: Room, player: Player, combat: CombatState) {
  const pStats = effectiveStats(player);
  const damage = Math.max(1, combat.enemy.physical - Math.floor(pStats.defense * 0.75));
  player.stats.hp = clamp(player.stats.hp - damage, 0, player.stats.maxHp);
  combat.log.unshift(`${combat.enemy.name} の攻撃。${player.name} は ${damage} ダメージ。`);
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

function winCombat(room: Room, player: Player, enemy: Enemy) {
  player.stats.exp += enemy.exp;
  player.stats.gold += enemy.gold;
  player.stats.score += enemy.score;
  if (enemy.kind === "boss") {
    player.defeatedBosses.push(enemy.stage);
    if (!room.players.some((p) => p.id !== player.id && p.defeatedBosses.includes(enemy.stage))) player.stats.score += 10;
    room.logs.unshift(`${player.name} は 中ボス${enemy.stage} を倒した！スコア +${enemy.score}`);
    room.notice = makeNotice("boss", `${player.name} の中ボス結果`, `勝利！スコア+${enemy.score}。次の村へ進みます。`, player);
    movePlayer(room, player, 1);
    resolveLanding(room, player);
  } else if (enemy.kind === "demon") {
    player.stats.score += 100;
    room.phase = "finished";
    room.winnerId = player.id;
    finalizeScores(room);
    room.logs.unshift(`${player.name} が魔王を倒した！ゲーム終了。`);
    room.notice = makeNotice("boss", `${player.name} の魔王結果`, "魔王撃破！ゲーム終了。", player);
  } else {
    room.logs.unshift(`${player.name} は ${enemy.name} を倒した。`);
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
    room.notice = makeNotice("treasure", `${player.name} の宝箱結果`, `${gear.name} を入手した。${gearStats(gear)}`, player);
  } else if (r < 0.9) {
    const gold = 80 + stage * 40;
    player.stats.gold += gold;
    room.logs.unshift(`${player.name} は宝箱から ${gold}G を得た。`);
    room.notice = makeNotice("treasure", `${player.name} の宝箱結果`, `${gold}G を入手した。`, player);
  } else {
    const item = makeItem(pick(Object.keys(itemCatalog) as ItemKey[]));
    addItem(room, player, item);
    room.logs.unshift(`${player.name} は宝箱から ${item.name} を得た。`);
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
  if (player.skipTurns > 0) {
    player.skipTurns -= 1;
    room.logs.unshift(`${player.name}は体調不良で次のターンを休んだ。`);
    room.notice = makeNotice("event", `${player.name} の休み`, "体調不良で次のターンを休んだ。", player);
    nextTurn(room);
    return;
  }
  room.logs.unshift(`${player.name} のターン。`);
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
    value: power * (rarity === "legendary" ? 30 : rarity === "epic" ? 20 : rarity === "rare" ? 12 : 8),
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
  }
}

function finalizeScores(room: Room) {
  room.players.forEach((p) => {
    p.stats.score = finalScore(p);
  });
}

function finalScore(player: Player) {
  const legendary = [...player.inventory.weapons, ...player.inventory.armors, ...player.inventory.accessories, ...Object.values(player.equipment)].filter((g) => g?.rarity === "legendary").length;
  return player.stats.score + player.stats.level * 2 + legendary * 5 + Math.floor(player.stats.gold / 100);
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  Gear,
  GearType,
  Item,
  ItemKey,
  Job,
  Player,
  Room,
  TileType,
  itemCatalog,
} from "@/shared/game";
import { createId } from "@/shared/id";

type AppPanel = "main" | "items" | "gear" | "map" | "log" | "shop" | "sell";
type BranchOption = {
  to: number;
  label: string;
  previewType?: TileType;
  previewLabel?: string;
  previewPath?: number[];
};

const socket: Socket = io();

const storage = {
  get playerId() {
    return typeof window === "undefined" ? "" : localStorage.getItem("playerId") || "";
  },
  set playerId(value: string) {
    localStorage.setItem("playerId", value);
  },
  get roomCode() {
    return typeof window === "undefined" ? "" : localStorage.getItem("roomCode") || "";
  },
  set roomCode(value: string) {
    localStorage.setItem("roomCode", value);
  },
};

const itemNames: Record<ItemKey, string> = {
  potion: "回復薬",
  hiPotion: "上級回復薬",
  ether: "魔力薬",
  hiEther: "上級魔力薬",
  warpStone: "ワープ石",
  windFeather: "疾風の羽",
  luckyCharm: "幸運のお守り",
};

const itemDescriptions: Record<ItemKey, string> = {
  potion: "HPを50回復します。",
  hiPotion: "HPを全回復します。",
  ether: "MPを50回復します。",
  hiEther: "MPを全回復します。",
  warpStone: "最後に訪れた村へ戻ります。",
  windFeather: "次のルーレット結果を+2します。",
  luckyCharm: "次の宝箱のレア率を上げます。",
};

const jobLabels: Record<Job, string> = {
  adventurer: "冒険者",
  warrior: "戦士",
  mage: "魔法使い",
};

const gearTypeLabels: Record<GearType, string> = {
  weapon: "武器",
  armor: "防具",
  accessory: "アクセサリー",
};

const tileLabels: Record<TileType, string> = {
  empty: "通常",
  battle: "戦闘",
  treasure: "宝箱",
  event: "イベント",
  start: "スタート",
  village: "村",
  boss: "中ボス",
  demon: "魔王",
  junction: "分岐",
};

const tileGlyphs: Record<TileType, string> = {
  empty: "·",
  battle: "⚔",
  treasure: "▣",
  event: "?",
  start: "S",
  village: "⌂",
  boss: "♛",
  demon: "◆",
  junction: "◇",
};

const rarityLabels: Record<Gear["rarity"], string> = {
  normal: "ノーマル",
  rare: "レア",
  epic: "エピック",
  legendary: "レジェンダリー",
};

const rarityScore: Record<Gear["rarity"], number> = {
  normal: 1,
  rare: 3,
  epic: 6,
  legendary: 10,
};

export default function Home() {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [message, setMessage] = useState("");
  const [panel, setPanel] = useState<AppPanel>("main");

  useEffect(() => {
    const storedPlayerId = storage.playerId || createId("player");
    setPlayerId(storedPlayerId);
    storage.playerId = storedPlayerId;
    setRoomCode(storage.roomCode);
    setJoinCode(storage.roomCode);
    socket.on("room:update", (next: Room) => setRoom(next));
    return () => {
      socket.off("room:update");
    };
  }, []);

  const me = room?.players.find((p) => p.id === playerId);
  const current = room?.players[room.currentTurn];
  const activeTile = me && room ? room.tiles[me.position] : undefined;
  const isMyTurn = current?.id === playerId;

  useEffect(() => {
    setPanel("main");
  }, [room?.currentTurn, room?.combat?.playerId, room?.notice?.title, room?.pendingMove?.playerId]);

  const call = (event: string, payload: Record<string, unknown> = {}) => {
    socket.emit(event, { roomCode, playerId, ...payload }, (res: { ok: boolean; message?: string; roomCode?: string; playerId?: string }) => {
      if (!res?.ok) {
        setMessage(res?.message || "操作に失敗しました。");
        return;
      }
      setMessage(res.message || "");
      if (res.roomCode) {
        setRoomCode(res.roomCode);
        storage.roomCode = res.roomCode;
      }
      if (res.playerId) {
        setPlayerId(res.playerId);
        storage.playerId = res.playerId;
      }
    });
  };

  const createRoom = () => {
    socket.emit("room:create", { name: name || "Player", playerId }, (res: { ok: boolean; roomCode: string; playerId: string; message?: string }) => {
      if (!res.ok) {
        setMessage(res.message || "ルームを作成できませんでした。");
        return;
      }
      setRoomCode(res.roomCode);
      setPlayerId(res.playerId);
      storage.roomCode = res.roomCode;
      storage.playerId = res.playerId;
    });
  };

  const joinRoom = () => {
    const code = joinCode.trim().toUpperCase();
    socket.emit("room:join", { roomCode: code, name: name || "Player", playerId }, (res: { ok: boolean; playerId: string; message?: string }) => {
      if (!res.ok) {
        setMessage(res.message || "ルームに参加できませんでした。");
        return;
      }
      setRoomCode(code);
      setPlayerId(res.playerId);
      storage.roomCode = code;
      storage.playerId = res.playerId;
    });
  };

  if (!room || room.phase === "lobby") {
    return (
      <main className="phoneShell lobbyShell">
        <section className="lobbyHero">
          <p className="eyebrow">RPG Sugoroku Party</p>
          <h1>RPGすごろく</h1>
          <p>同じWi-Fiのスマホや複数タブから、最大4人で遊べるMVPです。</p>
        </section>

        <section className="panel stack">
          <label>
            プレイヤー名
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名前" />
          </label>
          <button onClick={createRoom}>ルーム作成</button>
          <div className="joinRow">
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ROOM" maxLength={4} />
            <button onClick={joinRoom}>参加</button>
          </div>
          {room && (
            <div className="lobbyBox">
              <strong>ROOM {room.code}</strong>
              <PlayerList players={room.players} currentId={playerId} compact />
              <button disabled={room.hostId !== playerId} onClick={() => call("game:start")}>ゲーム開始</button>
            </div>
          )}
          {message && <p className="noticeText">{message}</p>}
        </section>
      </main>
    );
  }

  if (room.phase === "finished") {
    const ranking = [...room.players].sort((a, b) => finalScore(b) - finalScore(a));
    return (
      <main className="phoneShell">
        <header className="appHeader">
          <div>
            <b>ROOM {room.code}</b>
            <span>ゲーム終了</span>
          </div>
        </header>
        <section className="mainStage">
          <div className="stageScroll panel stack">
            <h1>最終スコア</h1>
            <div className="ranking">
              {ranking.map((p, index) => (
                <div className="rank" key={p.id}>
                  <span>{index + 1}</span>
                  <strong>P{p.slot} {p.name}</strong>
                  <b>{finalScore(p)} pt</b>
                </div>
              ))}
            </div>
            <Log logs={room.logs} />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="phoneShell">
      <header className="appHeader">
        <div className="headerLine">
          <div>
            <b>ROOM {room.code}</b>
            <span>{current ? `現在: P${current.slot} ${current.name}` : "待機中"}</span>
          </div>
          <span className={isMyTurn ? "turnBadge active" : "turnBadge"}>{isMyTurn ? "自分のターン" : "待機中"}</span>
        </div>
        {me && <CompactStatus player={me} activeTileLabel={activeTile ? `${tileGlyphs[activeTile.type]} ${activeTile.label}` : ""} />}
      </header>

      <section className="mainStage">
        {me ? (
          <MainStage
            room={room}
            me={me}
            panel={panel}
            setPanel={setPanel}
            isMyTurn={isMyTurn}
            call={call}
          />
        ) : (
          <div className="panel">プレイヤー情報を取得しています。</div>
        )}
      </section>

      <BottomNav
        panel={panel}
        setPanel={setPanel}
        locked={!!room.pendingMove}
        canRoll={!!me && isMyTurn && !room.turnRolled && !room.combat && !room.pendingMove}
        onRoll={() => call("turn:roll")}
      />

      {message && <div className="toast">{message}</div>}
    </main>
  );
}

function MainStage({
  room,
  me,
  panel,
  setPanel,
  isMyTurn,
  call,
}: {
  room: Room;
  me: Player;
  panel: AppPanel;
  setPanel: (panel: AppPanel) => void;
  isMyTurn: boolean;
  call: (event: string, payload?: Record<string, unknown>) => void;
}) {
  const activeTile = room.tiles[me.position];
  const combat = room.combat;
  const combatIsMine = combat?.playerId === me.id;
  const inVillage = activeTile?.type === "village";
  const pendingMine = room.pendingMove?.playerId === me.id;
  const pendingPlayer = room.pendingMove ? room.players.find((p) => p.id === room.pendingMove?.playerId) : undefined;
  const onJunction = activeTile?.type === "junction" && isMyTurn;

  if (combat) {
    return (
      <StageCard title={combatIsMine ? "戦闘中" : "他プレイヤーが戦闘中"}>
        <CombatPanel combat={combat} me={me} canAct={combatIsMine && isMyTurn} call={call} />
      </StageCard>
    );
  }

  if (pendingMine || onJunction) {
    return (
      <StageCard title="道を選ぶ">
        <BranchPanel room={room} me={me} canChoose call={call} />
      </StageCard>
    );
  }

  if (room.pendingMove) {
    return (
      <StageCard title="分岐選択待ち">
        <p className="hint">{pendingPlayer ? `P${pendingPlayer.slot} ${pendingPlayer.name}` : "現在のプレイヤー"} が進む道を選んでいます。</p>
        <BranchPanel room={room} me={pendingPlayer ?? me} canChoose={false} call={call} />
      </StageCard>
    );
  }

  if (isMyTurn && inVillage && panel !== "gear" && panel !== "shop" && panel !== "sell" && panel !== "log" && panel !== "map") {
    return (
      <StageCard title="村で準備">
        <VillagePanel me={me} call={call} setPanel={setPanel} />
      </StageCard>
    );
  }

  if (panel === "items") {
    return (
      <StageCard title="アイテム">
        <ItemUsePanel me={me} disabled={!isMyTurn} turnRolled={room.turnRolled} inCombat={false} call={call} />
      </StageCard>
    );
  }

  if (panel === "gear") {
    return (
      <StageCard title="装備変更">
        <GearPanel me={me} disabled={!isMyTurn} call={call} />
      </StageCard>
    );
  }

  if (panel === "shop") {
    return (
      <StageCard title="ショップ">
        <ShopPanel disabled={!isMyTurn || !inVillage} call={call} />
      </StageCard>
    );
  }

  if (panel === "sell") {
    return (
      <StageCard title="売却">
        <SellPanel me={me} disabled={!isMyTurn || !inVillage} call={call} />
      </StageCard>
    );
  }

  if (panel === "log") {
    return (
      <StageCard title="ログ/詳細">
        <DetailPanel room={room} me={me} />
      </StageCard>
    );
  }

  if (panel === "map") {
    return (
      <StageCard title="マップ確認">
        <MapPanel room={room} me={me} />
      </StageCard>
    );
  }

  if (room.notice && room.notice.type !== "system") {
    return (
      <StageCard title={room.notice.title}>
        <NoticePanel notice={room.notice} />
        {room.activity && <ActivityPanel room={room} />}
        <div className="miniDivider" />
        <GameMap room={room} me={me} />
        {isMyTurn && room.turnRolled && !inVillage && (
          <button className="primaryAction" onClick={() => call("turn:end")}>ターン終了</button>
        )}
      </StageCard>
    );
  }

  return (
    <StageCard title="マップ">
      {room.notice && <NoticePanel notice={room.notice} compact />}
      {room.activity && <ActivityPanel room={room} />}
      <GameMap room={room} me={me} />
      <TurnHint room={room} me={me} isMyTurn={isMyTurn} call={call} />
    </StageCard>
  );
}

function StageCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="stageCard">
      <div className="stageTitle">{title}</div>
      <div className="stageScroll">{children}</div>
    </div>
  );
}

function BottomNav({
  panel,
  setPanel,
  locked,
  canRoll,
  onRoll,
}: {
  panel: AppPanel;
  setPanel: (panel: AppPanel) => void;
  locked: boolean;
  canRoll: boolean;
  onRoll: () => void;
}) {
  return (
    <nav className="bottomNav" aria-label="主要メニュー">
      <button onClick={onRoll} disabled={!canRoll}>
        <span>🎲</span>
        ルーレット
      </button>
      <button disabled={locked} className={panel === "items" ? "selectedNav" : ""} onClick={() => setPanel("items")}>
        <span>＋</span>
        アイテム
      </button>
      <button disabled={locked} className={panel === "gear" ? "selectedNav" : ""} onClick={() => setPanel("gear")}>
        <span>⚙</span>
        装備
      </button>
      <button disabled={locked} className={panel === "map" || panel === "main" ? "selectedNav" : ""} onClick={() => setPanel("map")}>
        <span>◇</span>
        マップ
      </button>
      <button disabled={locked} className={panel === "log" ? "selectedNav" : ""} onClick={() => setPanel("log")}>
        <span>≡</span>
        ログ
      </button>
    </nav>
  );
}

function CompactStatus({ player, activeTileLabel }: { player: Player; activeTileLabel: string }) {
  const bonus = gearBonus(player);
  return (
    <div className="compactStatus">
      <span>P{player.slot} {jobLabels[player.job]} Lv.{player.stats.level}</span>
      <span>HP {player.stats.hp}/{player.stats.maxHp}</span>
      <span>MP {player.stats.mp}/{player.stats.maxMp}</span>
      <span>物攻 {player.stats.physical + bonus.physical}</span>
      <span>防御 {player.stats.defense + bonus.defense}</span>
      <span>{activeTileLabel}</span>
    </div>
  );
}

function TurnHint({ room, me, isMyTurn, call }: { room: Room; me: Player; isMyTurn: boolean; call: (event: string, payload?: Record<string, unknown>) => void }) {
  const activeTile = room.tiles[me.position];

  if (!isMyTurn) {
    return <p className="hint">他プレイヤーの操作を待っています。</p>;
  }
  if (me.skipTurns > 0) {
    return <p className="hint">次のターン休み状態です。ターンが回ると自動でスキップされます。</p>;
  }
  if (activeTile?.type === "village") {
    return <p className="hint">村では準備を終えるまでターン終了しません。</p>;
  }
  if (room.turnRolled) {
    return <button className="primaryAction" onClick={() => call("turn:end")}>ターン終了</button>;
  }
  return <p className="hint">下のルーレットを押して移動します。アイテムや装備は移動前に変更できます。</p>;
}

function NoticePanel({ notice, compact = false }: { notice: NonNullable<Room["notice"]>; compact?: boolean }) {
  return (
    <div className={`resultPanel ${notice.type} ${compact ? "compactResult" : ""}`}>
      <strong>{notice.playerName ? `${notice.playerName} の結果` : notice.title}</strong>
      {!compact && <b>{notice.title}</b>}
      <p>{notice.body}</p>
    </div>
  );
}

function ActivityPanel({ room }: { room: Room }) {
  const activity = room.activity;
  const actor = activity?.playerId ? room.players.find((p) => p.id === activity.playerId) : undefined;
  if (!activity) return null;
  return (
    <div className={`activityPanel ${activity.kind}`}>
      <strong>{actor ? `P${actor.slot} ${actor.name}` : "進行状況"}</strong>
      <p>{activity.text}</p>
      {activity.roll && <span>出目 {activity.roll} / 移動 {activity.move}</span>}
    </div>
  );
}

function GameMap({ room, me }: { room: Room; me: Player }) {
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>();
  const positions = useMemo(() => {
    const map = new globalThis.Map<number, Player[]>();
    room.players.forEach((p) => map.set(p.position, [...(map.get(p.position) || []), p]));
    return map;
  }, [room.players]);

  const focus = room.players[room.currentTurn] ?? me;
  const focusTile = room.tiles[focus.position] ?? room.tiles[me.position];
  const stage = focusTile?.stage === 0 ? 1 : focusTile?.stage ?? 1;
  const stageEntries = useMemo(
    () => room.tiles.map((tile, index) => ({ tile, index })).filter(({ tile }) => tile.stage === stage || (stage === 1 && tile.stage === 0)),
    [room.tiles, stage],
  );
  const visible = new Set(stageEntries.map(({ index }) => index));
  const path = new Set(room.lastMovePath ?? room.activity?.path ?? []);
  const branchTargets = new Set(room.pendingMove?.options.map((option) => option.to) ?? []);
  const branchPreview = new Set(room.pendingMove?.options.flatMap((option) => option.previewPath ?? []) ?? []);
  const detailIndex = selectedIndex ?? focus.position;
  const detailTile = room.tiles[detailIndex] ?? focusTile;
  const nearby = (detailTile.connections ?? [])
    .map((to) => room.tiles[to])
    .filter(Boolean)
    .slice(0, 3);
  const lines = stageEntries.flatMap(({ tile, index }) =>
    (tile.connections ?? [])
      .filter((to) => visible.has(to))
      .map((to) => ({ from: index, to })),
  );
  const getPoint = (index: number) => {
    const tile = room.tiles[index];
    return { x: tile.x ?? 50, y: tile.y ?? 50 };
  };

  return (
    <div className="islandMap">
      <svg className="mapLinks" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {lines.map((line) => {
          const a = getPoint(line.from);
          const b = getPoint(line.to);
          const highlighted = path.has(line.from) && path.has(line.to);
          const candidate = !!room.pendingMove && line.from === room.pendingMove.from && branchTargets.has(line.to);
          return <line className={`${highlighted ? "activeLink" : ""} ${candidate ? "candidateLink" : ""}`} key={`${line.from}-${line.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
        })}
      </svg>
      {stageEntries.map(({ tile, index }) => (
          <div
            className={`mapNode ${tile.type} ${me.position === index ? "mine" : ""} ${focus.position === index ? "focus" : ""} ${path.has(index) ? "pathNode" : ""} ${branchTargets.has(index) ? "candidateNode" : ""} ${branchPreview.has(index) ? "previewNode" : ""} ${selectedIndex === index ? "selectedNode" : ""}`}
            key={`${tile.id}-${index}`}
            style={{ left: `${tile.x ?? 50}%`, top: `${tile.y ?? 50}%` }}
            role="button"
            aria-label={`${tileLabels[tile.type]} ${tile.label}`}
            onClick={() => setSelectedIndex(index)}
          >
            <div className="nodeIcon">{tileGlyphs[tile.type]}</div>
            <div className="pieces">{positions.get(index)?.map((p) => <i key={p.id}>P{p.slot}</i>)}</div>
          </div>
        ))}
      <div className="mapInfoPanel">
        <strong>{selectedIndex === undefined ? "現在地" : "選択マス"}: {tileLabels[detailTile.type]}</strong>
        <span>ステージ {detailTile.stage || 1}{detailTile.recommendedLevel ? ` / 推奨Lv${detailTile.recommendedLevel}` : ""}</span>
        <span>周辺: {nearby.length ? nearby.map((tile) => `${tileGlyphs[tile.type]} ${tileLabels[tile.type]}`).join(" / ") : "なし"}</span>
      </div>
    </div>
  );
}

function BranchPanel({ room, me, canChoose, call }: { room: Room; me: Player; canChoose: boolean; call: (event: string, payload?: Record<string, unknown>) => void }) {
  const tile = room.tiles[me.position];
  const options: BranchOption[] = room.pendingMove?.playerId === me.id
    ? room.pendingMove.options
    : (tile.connections ?? []).map((to, index) => ({ to, label: tile.connectionLabels?.[index] ?? `${room.tiles[to]?.label ?? "道"}へ` }));

  return (
    <div className="stack">
      <p className="hint">{room.pendingMove ? `残り${room.pendingMove.remaining}マス。進む道を選ぶと移動を続けます。` : "次に進む道を選んでください。"}</p>
      <div className="branchChoices">
        {options.map((option, index) => {
          const destination = room.tiles[option.to];
          const bossRoute = destination?.type === "boss" || option.label.includes("中ボス");
          return (
            <button disabled={!canChoose} className={bossRoute ? "bossChoice" : "loopChoice"} key={`${option.to}-${option.label}`} onClick={() => call("branch:choose", { choice: String(option.to) })}>
              道{index + 1}
              <small>{option.previewType ? `${tileGlyphs[option.previewType]} ${tileLabels[option.previewType]}に止まる見込み` : destination ? `${tileGlyphs[destination.type]} ${tileLabels[destination.type]}方面` : "道を進む"}</small>
            </button>
          );
        })}
      </div>
      <MapPanel room={room} me={me} />
    </div>
  );
}

function ItemUsePanel({ me, disabled, turnRolled, inCombat, call }: { me: Player; disabled: boolean; turnRolled: boolean; inCombat: boolean; call: (event: string, payload?: Record<string, unknown>) => void }) {
  const [selected, setSelected] = useState<Item | undefined>();
  const grouped = useMemo(() => {
    const map = new globalThis.Map<ItemKey, { item: Item; count: number }>();
    me.inventory.items.forEach((item) => {
      const current = map.get(item.key);
      map.set(item.key, { item, count: (current?.count ?? 0) + 1 });
    });
    return [...map.values()];
  }, [me.inventory.items]);

  useEffect(() => {
    if (selected && !me.inventory.items.some((item) => item.id === selected.id)) setSelected(undefined);
  }, [me.inventory.items, selected]);

  useEffect(() => {
    if (disabled) setSelected(undefined);
  }, [disabled]);

  const canUse = (item: Item) => {
    if (disabled) return false;
    if (inCombat) return ["potion", "hiPotion", "ether", "hiEther"].includes(item.key);
    if (item.key === "windFeather") return !turnRolled;
    return true;
  };

  return (
    <div className="stack">
      <div className="itemList">
        {grouped.map(({ item, count }) => (
          <button className={selected?.key === item.key ? "selectedItem" : ""} disabled={!canUse(item)} key={item.key} onClick={() => setSelected(item)}>
            <span>{itemNames[item.key]}</span>
            <b>×{count}</b>
          </button>
        ))}
      </div>
      {!grouped.length && <p className="hint">アイテムを持っていません。</p>}
      {selected && (
        <div className="confirmBox">
          <strong>{itemNames[selected.key]}</strong>
          <p>{itemDescriptions[selected.key]}</p>
          <div className="confirmActions">
            <button onClick={() => setSelected(undefined)}>キャンセル</button>
            <button disabled={!canUse(selected)} onClick={() => {
              call("item:use", { itemId: selected.id });
              setSelected(undefined);
            }}>使用しますか？</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GearPanel({ me, disabled, call }: { me: Player; disabled: boolean; call: (event: string, payload?: Record<string, unknown>) => void }) {
  const [selected, setSelected] = useState<Gear | undefined>();
  const lists: Record<GearType, Gear[]> = {
    weapon: me.inventory.weapons,
    armor: me.inventory.armors,
    accessory: me.inventory.accessories,
  };
  const current = selected ? me.equipment[selected.type] : undefined;
  const diff = selected ? {
    physical: selected.physical - (current?.physical ?? 0),
    magical: selected.magical - (current?.magical ?? 0),
    defense: selected.defense - (current?.defense ?? 0),
  } : undefined;

  return (
    <div className="stack">
      <EquipmentSummary player={me} />
      {(["weapon", "armor", "accessory"] as GearType[]).map((type) => (
        <div className="gearGroup" key={type}>
          <h3>{gearTypeLabels[type]}</h3>
          <div className="gearList">
            {lists[type].map((gear) => {
              const equipped = me.equipment[type]?.id === gear.id;
              const isSelected = selected?.id === gear.id;
              return (
                <button className={`gearCard ${gear.rarity} ${equipped ? "equipped" : ""} ${isSelected ? "selected" : ""}`} key={gear.id} onClick={() => setSelected(gear)}>
                  <span>{rarityLabels[gear.rarity]} {gearTypeLabels[gear.type]}</span>
                  <strong>{gear.name}</strong>
                  <small>{gearStats(gear)}</small>
                  {equipped && <i>装備中</i>}
                  {isSelected && !equipped && <i>選択中</i>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {selected && (
        <div className="confirmBox">
          <p>現在: {current ? `${current.name} ${gearStats(current)}` : "なし"}</p>
          <p>選択: {selected.name} {gearStats(selected)}</p>
          {diff && <p>差分: {statDiff("物攻", diff.physical)} {statDiff("魔攻", diff.magical)} {statDiff("防御", diff.defense)}</p>}
          <button disabled={disabled || current?.id === selected.id} onClick={() => call("gear:equip", { gearId: selected.id })}>装備変更</button>
        </div>
      )}
    </div>
  );
}

function MapPanel({ room, me }: { room: Room; me: Player }) {
  const currentTile = room.tiles[me.position];
  const options = room.pendingMove?.playerId === me.id
    ? room.pendingMove.options
    : (currentTile?.connections ?? []).map((to, index) => ({ to, label: currentTile.connectionLabels?.[index] ?? `${room.tiles[to]?.label ?? "道"}へ` }));
  const nextBoss = findNextTile(room, me.position, "boss", currentTile?.stage);
  const nextVillage = findNextTile(room, me.position, "village", currentTile?.stage);
  const nextDemon = findNextTile(room, me.position, "demon");

  return (
    <div className="stack">
      <div className="mapSummary">
        <span>現在地: {tileLabels[currentTile.type]} / {currentTile.label}</span>
        <span>中ボス: {nextBoss ? `${nextBoss.label} 推奨Lv${nextBoss.recommendedLevel}` : "現在ステージには未検出"}</span>
        <span>村: {nextVillage?.label ?? "現在ステージには未検出"}</span>
        <span>魔王: {nextDemon ? `${nextDemon.label} 推奨Lv${nextDemon.recommendedLevel}` : "未検出"}</span>
      </div>
      <div className="routeList">
        <strong>{options.length ? "ここから選べる道" : "近くのルート"}</strong>
        {(options.length ? options : describeNearbyConnections(room, me.position)).map((option) => (
          <span key={`${option.to}-${option.label}`}>{option.label}: {room.tiles[option.to] ? `${tileLabels[room.tiles[option.to].type]} / ${room.tiles[option.to].label}` : "道"}</span>
        ))}
      </div>
      <GameMap room={room} me={me} />
    </div>
  );
}

function VillagePanel({ me, call, setPanel }: { me: Player; call: (event: string, payload?: Record<string, unknown>) => void; setPanel: (panel: AppPanel) => void }) {
  return (
    <div className="stack">
      <p className="hint">村では回復、買い物、売却、転職、装備変更ができます。準備が終わったらターン終了してください。</p>
      <div className="menuGrid">
        <button onClick={() => call("village:recover")}>回復</button>
        <button onClick={() => setPanel("shop")}>ショップ</button>
        <button onClick={() => setPanel("sell")}>売却</button>
        <button onClick={() => setPanel("gear")}>装備変更</button>
      </div>
      {!me.changedJob && (
        <div className="jobList">
          {(["adventurer", "warrior", "mage"] as Job[]).map((job) => (
            <button key={job} onClick={() => call("job:change", { job })}>{jobLabels[job]}</button>
          ))}
        </div>
      )}
      <button className="primaryAction" onClick={() => call("turn:end")}>村での準備を終えてターン終了</button>
    </div>
  );
}

function ShopPanel({ disabled, call }: { disabled: boolean; call: (event: string, payload?: Record<string, unknown>) => void }) {
  return (
    <div className="itemList">
      {(Object.keys(itemCatalog) as ItemKey[]).map((key) => (
        <button disabled={disabled} key={key} onClick={() => call("shop:buy", { itemKey: key })}>
          <span>{itemNames[key]}</span>
          <b>{itemCatalog[key].value}G</b>
        </button>
      ))}
    </div>
  );
}

function SellPanel({ me, disabled, call }: { me: Player; disabled: boolean; call: (event: string, payload?: Record<string, unknown>) => void }) {
  const entries = [...me.inventory.weapons, ...me.inventory.armors, ...me.inventory.accessories, ...me.inventory.items];
  return (
    <div className="itemList">
      {entries.map((entry) => (
        <button disabled={disabled} key={entry.id} onClick={() => call("inventory:sell", { id: entry.id })}>
          <span>売却 {entry.name}</span>
          {"key" in entry ? <b>{itemNames[entry.key]}</b> : <b>{rarityLabels[entry.rarity]}</b>}
        </button>
      ))}
      {!entries.length && <p className="hint">売却できるものがありません。</p>}
    </div>
  );
}

function CombatPanel({ combat, me, canAct, call }: { combat: NonNullable<Room["combat"]>; me: Player; canAct: boolean; call: (event: string, payload?: Record<string, unknown>) => void }) {
  const [lockedUntil, setLockedUntil] = useState(0);
  useEffect(() => {
    if (combat.updatedAt) {
      const until = Date.now() + 700;
      setLockedUntil(until);
      const timer = window.setTimeout(() => setLockedUntil(0), 720);
      return () => window.clearTimeout(timer);
    }
  }, [combat.updatedAt]);
  const animating = lockedUntil > Date.now();
  const actionable = canAct && !animating;
  return (
    <div className="stack">
      <div className="enemyBox">
        <strong>{combat.enemy.name}</strong>
        {combat.enemy.recommendedLevel && <span>推奨Lv{combat.enemy.recommendedLevel}</span>}
        <div className="meter"><span style={{ width: `${Math.max(0, (combat.enemy.hp / combat.enemy.maxHp) * 100)}%` }} /></div>
        <p>{combat.enemy.hp}/{combat.enemy.maxHp} HP</p>
      </div>
      <div className={`combatBeat ${combat.phase ?? "idle"}`}>
        <strong>{combat.lastAction ?? "コマンドを選んでください。"}</strong>
        {animating && <span>演出中...</span>}
      </div>
      <div className="combatActions">
        <button disabled={!actionable} onClick={() => call("combat:command", { command: "attack" })}>攻撃</button>
        <button disabled={!actionable} onClick={() => call("combat:command", { command: "skill" })}>スキル</button>
        <button disabled={!actionable || combat.enemy.kind !== "mob"} onClick={() => call("combat:command", { command: "run" })}>逃げる</button>
      </div>
      <div className="itemList compactItems">
        {me.inventory.items.filter((i) => ["potion", "hiPotion", "ether", "hiEther"].includes(i.key)).map((item) => (
          <button disabled={!actionable} key={item.id} onClick={() => call("combat:command", { command: "item", itemId: item.id })}>{itemNames[item.key]}</button>
        ))}
      </div>
      <Log logs={combat.log} />
    </div>
  );
}

function DetailPanel({ room, me }: { room: Room; me: Player }) {
  return (
    <div className="stack">
      <Status player={me} />
      <PlayerList players={room.players} currentId={me.id} />
      <Log logs={room.logs} />
    </div>
  );
}

function PlayerList({ players, currentId, compact = false }: { players: Player[]; currentId: string; compact?: boolean }) {
  return (
    <div className={compact ? "players compactPlayers" : "players"}>
      {players.map((p) => (
        <div className="player" key={p.id}>
          <b>P{p.slot} {p.name}{p.id === currentId ? " (自分)" : ""}</b>
          <span>{p.connected ? "接続中" : "切断中"} / Lv.{p.stats.level} / {finalScore(p)}pt / {p.stats.gold}G{p.skipTurns > 0 ? " / 次のターン休み" : ""}</span>
        </div>
      ))}
    </div>
  );
}

function Status({ player }: { player: Player }) {
  const bonus = gearBonus(player);
  return (
    <div className="status">
      <strong>{jobLabels[player.job]} Lv.{player.stats.level}</strong>
      <span>HP {player.stats.hp}/{player.stats.maxHp}</span>
      <span>MP {player.stats.mp}/{player.stats.maxMp}</span>
      <span>物攻 {player.stats.physical + bonus.physical}（+{bonus.physical}）</span>
      <span>魔攻 {player.stats.magical + bonus.magical}（+{bonus.magical}）</span>
      <span>防御 {player.stats.defense + bonus.defense}（+{bonus.defense}）</span>
      <span>EXP {player.stats.exp} / Gold {player.stats.gold} / Score {finalScore(player)}</span>
      <EquipmentSummary player={player} />
    </div>
  );
}

function EquipmentSummary({ player }: { player: Player }) {
  return (
    <div className="equipment">
      <span>武器: {player.equipment.weapon ? `${player.equipment.weapon.name} ${gearStats(player.equipment.weapon)}` : "なし"}</span>
      <span>防具: {player.equipment.armor ? `${player.equipment.armor.name} ${gearStats(player.equipment.armor)}` : "なし"}</span>
      <span>アクセ: {player.equipment.accessory ? `${player.equipment.accessory.name} ${gearStats(player.equipment.accessory)}` : "なし"}</span>
    </div>
  );
}

function Log({ logs }: { logs: string[] }) {
  return <div className="log">{logs.slice(0, 16).map((log, i) => <p key={`${log}-${i}`}>{log}</p>)}</div>;
}

function gearBonus(player: Player) {
  const gear = Object.values(player.equipment);
  return {
    physical: gear.reduce((sum, g) => sum + (g?.physical ?? 0), 0),
    magical: gear.reduce((sum, g) => sum + (g?.magical ?? 0), 0),
    defense: gear.reduce((sum, g) => sum + (g?.defense ?? 0), 0),
  };
}

function gearStats(gear: Gear) {
  return [gear.physical ? `物攻+${gear.physical}` : "", gear.magical ? `魔攻+${gear.magical}` : "", gear.defense ? `防御+${gear.defense}` : ""].filter(Boolean).join(" ");
}

function statDiff(label: string, value: number) {
  if (!value) return `${label} ±0`;
  return `${label} ${value > 0 ? "+" : ""}${value}`;
}

function finalScore(player: Player) {
  const gearById = new Map<string, Gear>();
  [...player.inventory.weapons, ...player.inventory.armors, ...player.inventory.accessories, ...Object.values(player.equipment)]
    .filter(Boolean)
    .forEach((gear) => gearById.set(gear!.id, gear!));
  const gearScore = [...gearById.values()].reduce((sum, gear) => sum + rarityScore[gear.rarity], 0);
  return player.stats.score + player.stats.level * 2 + gearScore + Math.floor(player.stats.gold / 100);
}

function findNextTile(room: Room, position: number, type: TileType, stage?: number) {
  return room.tiles.find((tile, index) => index >= position && tile.type === type && (stage === undefined || tile.stage === stage));
}

function describeNearbyConnections(room: Room, position: number) {
  return room.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile, index }) => index >= position && tile.connections && tile.connections.length > 1)
    .slice(0, 2)
    .flatMap(({ tile }) => tile.connections!.map((to, optionIndex) => ({ to, label: `${tile.label} -> ${tile.connectionLabels?.[optionIndex] ?? room.tiles[to]?.label ?? "道"}` })));
}

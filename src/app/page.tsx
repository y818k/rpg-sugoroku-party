"use client";

import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Gear, GearType, Item, ItemKey, Job, Player, Room, gearTypeNames, itemCatalog, jobNames, tileIcons } from "@/shared/game";
import { createId } from "@/shared/id";

type PanelMode = "menu" | "items" | "gear" | "map" | "village" | "shop" | "sell";

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

export default function Home() {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [message, setMessage] = useState("");

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
  const combat = room?.combat && room.combat.playerId === playerId ? room.combat : undefined;

  const call = (event: string, payload: Record<string, unknown> = {}) => {
    socket.emit(event, { roomCode, playerId, ...payload }, (res: { ok: boolean; message?: string; roomCode?: string; playerId?: string }) => {
      if (!res?.ok) setMessage(res?.message || "操作に失敗しました。");
      else {
        setMessage(res.message || "");
        if (res.roomCode) {
          setRoomCode(res.roomCode);
          storage.roomCode = res.roomCode;
        }
        if (res.playerId) {
          setPlayerId(res.playerId);
          storage.playerId = res.playerId;
        }
      }
    });
  };

  const createRoom = () => {
    socket.emit("room:create", { name: name || "Player", playerId }, (res: { ok: boolean; roomCode: string; playerId: string; message?: string }) => {
      if (!res.ok) return setMessage(res.message || "作成できません。");
      setRoomCode(res.roomCode);
      setPlayerId(res.playerId);
      storage.roomCode = res.roomCode;
      storage.playerId = res.playerId;
    });
  };

  const joinRoom = () => {
    const code = joinCode.trim().toUpperCase();
    socket.emit("room:join", { roomCode: code, name: name || "Player", playerId }, (res: { ok: boolean; playerId: string; message?: string }) => {
      if (!res.ok) return setMessage(res.message || "参加できません。");
      setRoomCode(code);
      setPlayerId(res.playerId);
      storage.roomCode = code;
      storage.playerId = res.playerId;
    });
  };

  if (!room || room.phase === "lobby") {
    return (
      <main className="shell">
        <section className="hero">
          <div>
            <p className="eyebrow">RPG Sugoroku Party</p>
            <h1>RPG風すごろく</h1>
            <p>ルームコードで最大4人まで参加できます。複数タブを開いてローカル対戦を試せます。</p>
          </div>
        </section>
        <section className="panel stack">
          <label>
            プレイヤー名
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="名前" />
          </label>
          <div className="actions">
            <button onClick={createRoom}>ルーム作成</button>
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ROOM" maxLength={4} />
            <button onClick={joinRoom}>参加</button>
          </div>
          {room && (
            <div className="lobby">
              <strong>ルーム {room.code}</strong>
              <PlayerList players={room.players} currentId={playerId} />
              <button disabled={room.hostId !== playerId} onClick={() => call("game:start")}>ゲーム開始</button>
            </div>
          )}
          {message && <p className="notice">{message}</p>}
        </section>
      </main>
    );
  }

  if (room.phase === "finished") {
    const ranking = [...room.players].sort((a, b) => b.stats.score - a.stats.score);
    return (
      <main className="shell">
        <section className="panel">
          <h1>最終スコア</h1>
          <div className="ranking">
            {ranking.map((p, index) => (
              <div className="rank" key={p.id}>
                <span>{index + 1}</span>
                <strong>P{p.slot} {p.name}</strong>
                <b>{p.stats.score} pt</b>
              </div>
            ))}
          </div>
          <Log logs={room.logs} />
        </section>
      </main>
    );
  }

  return (
    <main className="game">
      <header className="topbar">
        <div>
          <b>ROOM {room.code}</b>
          <span>{current ? `現在: P${current.slot} ${current.name}` : ""}</span>
        </div>
        <span className={current?.id === playerId ? "turn on" : "turn"}>{current?.id === playerId ? "あなたのターン" : "待機中"}</span>
      </header>

      {room.notice && <NoticePanel notice={room.notice} currentPlayerId={current?.id} />}

      <section className="board">
        <GameMap room={room} me={me} compact />
      </section>

      <section className="content">
        <div className="panel">
          <h2>自分</h2>
          {me && <Status player={me} />}
          {activeTile && <p className="notice">現在地: {tileIcons[activeTile.type]} {activeTile.label}{activeTile.recommendedLevel ? ` 推奨Lv${activeTile.recommendedLevel}` : ""}</p>}
        </div>
        <div className="panel">
          <h2>プレイヤー</h2>
          <PlayerList players={room.players} currentId={playerId} />
        </div>
      </section>

      <section className={`panel controls ${combat ? "combatFocus" : ""}`}>
        {combat ? <CombatPanel combat={combat} me={me} call={call} /> : <TurnControls room={room} me={me} isTurn={current?.id === playerId} call={call} />}
      </section>

      <section className="panel">
        <h2>ログ</h2>
        <Log logs={room.logs} />
      </section>
      {message && <div className="toast">{message}</div>}
    </main>
  );
}

function NoticePanel({ notice, currentPlayerId }: { notice: NonNullable<Room["notice"]>; currentPlayerId?: string }) {
  const compact = !!notice.playerId && notice.playerId !== currentPlayerId;
  return (
    <section className={`noticePanel ${notice.type} ${compact ? "compactNotice" : ""}`}>
      <strong>{compact ? `前回の結果: ${notice.playerName ?? ""}` : notice.title}</strong>
      <p>{notice.body}</p>
    </section>
  );
}

function GameMap({ room, me, compact = false }: { room: Room; me?: Player; compact?: boolean }) {
  const positions = useMemo(() => {
    const map = new globalThis.Map<number, Player[]>();
    room.players.forEach((p) => map.set(p.position, [...(map.get(p.position) || []), p]));
    return map;
  }, [room.players]);

  return (
    <div className={`mapGrid ${compact ? "compact" : ""}`}>
      {room.tiles.map((tile, index) => (
        <div className={`tile ${tile.type} ${me?.position === index ? "mine" : ""}`} key={tile.id}>
          <span>{tileIcons[tile.type]}</span>
          <small>{tile.label}</small>
          {tile.recommendedLevel && <em>推奨Lv{tile.recommendedLevel}</em>}
          {tile.connections && tile.connections.length > 1 && <em>分岐</em>}
          <div className="pieces">{positions.get(index)?.map((p) => <i key={p.id}>P{p.slot}</i>)}</div>
        </div>
      ))}
    </div>
  );
}

function TurnControls({ room, me, isTurn, call }: { room: Room; me?: Player; isTurn: boolean; call: (event: string, payload?: Record<string, unknown>) => void }) {
  const [mode, setMode] = useState<PanelMode>("menu");
  const inVillage = !!me && room.tiles[me.position]?.type === "village";
  const choosingPath = !!me && room.pendingMove?.playerId === me.id;
  const onJunction = !!me && room.tiles[me.position]?.type === "junction";

  useEffect(() => {
    setMode(inVillage ? "village" : "menu");
  }, [room.currentTurn, inVillage]);

  if (!me) return null;
  if (!isTurn) return <p className="notice">他プレイヤーの操作を待っています。</p>;
  if (me.skipTurns > 0) return <p className="notice">次のターン休みです。ターンが回ると自動でスキップされます。</p>;
  if (choosingPath || onJunction) return <BranchPanel room={room} me={me} call={call} />;

  return (
    <div className="stack">
      <div className="menuGrid">
        <button className={mode === "menu" ? "active" : ""} onClick={() => setMode("menu")}>ルーレット</button>
        <button className={mode === "items" ? "active" : ""} onClick={() => setMode("items")}>アイテム使用</button>
        <button className={mode === "gear" ? "active" : ""} onClick={() => setMode("gear")}>装備変更</button>
        <button className={mode === "map" ? "active" : ""} onClick={() => setMode("map")}>マップ確認</button>
        {inVillage && <button className={mode === "village" ? "active" : ""} onClick={() => setMode("village")}>村</button>}
      </div>

      {mode === "menu" && (
        <div className="actionCard">
          <h2>ルーレット</h2>
          <p>1〜6の出目で進みます。移動中に分岐へ着いたら、残り歩数を持ったまま道を選びます。</p>
          <button disabled={room.turnRolled} onClick={() => call("turn:roll")}>ルーレットを回す</button>
          {room.turnRolled && !inVillage && <button onClick={() => call("turn:end")}>ターン終了</button>}
        </div>
      )}
      {mode === "items" && <ItemUsePanel me={me} call={call} />}
      {mode === "gear" && <GearPanel me={me} call={call} />}
      {mode === "map" && <MapPanel room={room} me={me} />}
      {mode === "village" && <VillagePanel me={me} call={call} setMode={setMode} />}
      {mode === "shop" && <ShopPanel call={call} />}
      {mode === "sell" && <SellPanel me={me} call={call} />}
    </div>
  );
}

function BranchPanel({ room, me, call }: { room: Room; me: Player; call: (event: string, payload?: Record<string, unknown>) => void }) {
  const tile = room.tiles[me.position];
  const options = room.pendingMove?.playerId === me.id
    ? room.pendingMove.options
    : (tile.connections ?? []).map((to, index) => ({ to, label: tile.connectionLabels?.[index] ?? `${room.tiles[to]?.label ?? "道"}へ` }));
  return (
    <div className="actionCard branchPanel">
      <h2>分岐地点</h2>
      <p>{room.pendingMove ? `残り${room.pendingMove.remaining}マス。道を選ぶと移動を続けます。` : "次に進む道を選んでください。"}</p>
      <div className="branchChoices">
        {options.map((option) => {
          const destination = room.tiles[option.to];
          const bossRoute = destination?.type === "boss" || option.label.includes("中ボス");
          return (
            <button className={bossRoute ? "bossChoice" : "loopChoice"} key={`${option.to}-${option.label}`} onClick={() => call("branch:choose", { choice: String(option.to) })}>
              {option.label}
              <small>{destination ? `${tileIcons[destination.type]} ${destination.label}${destination.recommendedLevel ? ` 推奨Lv${destination.recommendedLevel}` : ""}` : "道を進む"}</small>
            </button>
          );
        })}
      </div>
      <MapPanel room={room} me={me} />
    </div>
  );
}

function ItemUsePanel({ me, call }: { me: Player; call: (event: string, payload?: Record<string, unknown>) => void }) {
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
    if (selected && !me.inventory.items.some((item) => item.id === selected.id)) {
      setSelected(undefined);
    }
  }, [me.inventory.items, selected]);

  return (
    <div className="actionCard">
      <h2>アイテム使用</h2>
      <div className="items">
        {grouped.map(({ item, count }) => (
          <button key={item.key} onClick={() => setSelected(item)}>{item.name} ×{count}</button>
        ))}
      </div>
      {!grouped.length && <p>アイテムを持っていません。</p>}
      {selected && (
        <div className="confirmBox">
          <strong>{selected.name}</strong>
          <p>{itemCatalog[selected.key].description}</p>
          <button onClick={() => {
            call("item:use", { itemId: selected.id });
            setSelected(undefined);
          }}>使用しますか？</button>
        </div>
      )}
    </div>
  );
}

function GearPanel({ me, call }: { me: Player; call: (event: string, payload?: Record<string, unknown>) => void }) {
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
    <div className="actionCard">
      <h2>装備変更</h2>
      <EquipmentSummary player={me} />
      {(["weapon", "armor", "accessory"] as GearType[]).map((type) => (
        <div className="gearGroup" key={type}>
          <h3>{gearTypeNames[type]}</h3>
          <div className="items">
            {lists[type].map((gear) => {
              const equipped = me.equipment[type]?.id === gear.id;
              const isSelected = selected?.id === gear.id;
              return (
                <button className={`${gear.rarity} gearCard ${equipped ? "equipped" : ""} ${isSelected ? "selected" : ""}`} key={gear.id} onClick={() => setSelected(gear)}>
                  <span>{gear.name} {gearStats(gear)}</span>
                  <small>{equipped ? "✓ 装備中" : isSelected ? "選択中" : "比較する"}</small>
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
          <button disabled={current?.id === selected.id} onClick={() => call("gear:equip", { gearId: selected.id })}>装備変更</button>
        </div>
      )}
    </div>
  );
}

function MapPanel({ room, me }: { room: Room; me: Player }) {
  const currentTile = room.tiles[me.position];
  const stage = currentTile?.stage || 1;
  const nextBranch = room.tiles.find((tile, index) => index >= me.position && tile.type === "junction" && tile.stage === currentTile?.stage);
  const nextBoss = room.tiles.find((tile, index) => index >= me.position && tile.type === "boss" && tile.stage === currentTile?.stage);
  const nextVillage = room.tiles.find((tile, index) => index >= me.position && tile.type === "village" && tile.stage === currentTile?.stage);
  const currentOptions = room.pendingMove?.playerId === me.id
    ? room.pendingMove.options
    : (currentTile?.connections ?? []).map((to, index) => ({ to, label: currentTile.connectionLabels?.[index] ?? `${room.tiles[to]?.label ?? "道"}へ` }));
  const nearby = currentOptions.length ? currentOptions : describeNearbyConnections(room, me.position);

  return (
    <div className="actionCard">
      <h2>マップ確認</h2>
      <div className="mapSummary">
        <span>現在地: {tileIcons[currentTile?.type ?? "empty"]} {currentTile?.label}</span>
        <span>現在ステージ: {stage}</span>
        <span>次の分岐: {nextBranch?.label ?? "なし"}</span>
        <span>中ボス: {nextBoss ? `${nextBoss.label} 推奨Lv${nextBoss.recommendedLevel}` : "なし"}</span>
        <span>村: {nextVillage?.label ?? "なし"}</span>
      </div>
      <div className="routeList">
        <strong>{currentOptions.length ? "現在選べる道" : "近くの接続"}</strong>
        {nearby.map((option) => (
          <span key={`${option.to}-${option.label}`}>{option.label}: {tileIcons[room.tiles[option.to]?.type ?? "empty"]} {room.tiles[option.to]?.label}</span>
        ))}
      </div>
      <GameMap room={room} me={me} />
    </div>
  );
}

function describeNearbyConnections(room: Room, position: number) {
  return room.tiles
    .map((tile, index) => ({ tile, index }))
    .filter(({ tile, index }) => index >= position && tile.connections && tile.connections.length > 1)
    .slice(0, 2)
    .flatMap(({ tile }) => tile.connections!.map((to, optionIndex) => ({ to, label: `${tile.label} -> ${tile.connectionLabels?.[optionIndex] ?? room.tiles[to]?.label ?? "道"}` })));
}

function VillagePanel({ me, call, setMode }: { me: Player; call: (event: string, payload?: Record<string, unknown>) => void; setMode: (mode: PanelMode) => void }) {
  return (
    <div className="actionCard">
      <h2>村での準備</h2>
      <p>準備が終わるまでターンは進みません。</p>
      <div className="menuGrid">
        <button onClick={() => call("village:recover")}>回復</button>
        <button onClick={() => setMode("shop")}>ショップ</button>
        <button onClick={() => setMode("sell")}>売却</button>
        <button onClick={() => setMode("gear")}>装備変更</button>
      </div>
      {!me.changedJob && (
        <div className="items">
          {(["adventurer", "warrior", "mage"] as Job[]).map((job) => (
            <button key={job} onClick={() => call("job:change", { job })}>{jobNames[job]}</button>
          ))}
        </div>
      )}
      <button onClick={() => call("turn:end")}>村での準備を終えてターン終了</button>
    </div>
  );
}

function ShopPanel({ call }: { call: (event: string, payload?: Record<string, unknown>) => void }) {
  return (
    <div className="actionCard">
      <h2>ショップ</h2>
      <div className="items">
        {(Object.keys(itemCatalog) as ItemKey[]).map((key) => (
          <button key={key} onClick={() => call("shop:buy", { itemKey: key })}>{itemCatalog[key].name} {itemCatalog[key].value}G</button>
        ))}
      </div>
    </div>
  );
}

function SellPanel({ me, call }: { me: Player; call: (event: string, payload?: Record<string, unknown>) => void }) {
  const entries = [...me.inventory.weapons, ...me.inventory.armors, ...me.inventory.accessories, ...me.inventory.items];
  return (
    <div className="actionCard">
      <h2>売却</h2>
      <div className="items">
        {entries.map((entry) => (
          <button key={entry.id} onClick={() => call("inventory:sell", { id: entry.id })}>売却 {entry.name}</button>
        ))}
      </div>
    </div>
  );
}

function CombatPanel({ combat, me, call }: { combat: NonNullable<Room["combat"]>; me?: Player; call: (event: string, payload?: Record<string, unknown>) => void }) {
  return (
    <div className="stack">
      <h2>戦闘: {combat.enemy.name}{combat.enemy.recommendedLevel ? ` 推奨Lv${combat.enemy.recommendedLevel}` : ""}</h2>
      <div className="meter"><span style={{ width: `${(combat.enemy.hp / combat.enemy.maxHp) * 100}%` }} /></div>
      <p>{combat.enemy.hp}/{combat.enemy.maxHp} HP</p>
      <div className="actions">
        <button onClick={() => call("combat:command", { command: "attack" })}>攻撃</button>
        <button onClick={() => call("combat:command", { command: "skill" })}>スキル</button>
        <button disabled={combat.enemy.kind !== "mob"} onClick={() => call("combat:command", { command: "run" })}>逃げる</button>
      </div>
      <div className="items">
        {me?.inventory.items.filter((i) => ["potion", "hiPotion", "ether", "hiEther"].includes(i.key)).map((item) => (
          <button key={item.id} onClick={() => call("combat:command", { command: "item", itemId: item.id })}>{item.name}</button>
        ))}
      </div>
      <Log logs={combat.log} />
    </div>
  );
}

function PlayerList({ players, currentId }: { players: Player[]; currentId: string }) {
  return (
    <div className="players">
      {players.map((p) => (
        <div className="player" key={p.id}>
          <b>P{p.slot} {p.name}{p.id === currentId ? " (自分)" : ""}</b>
          <span>{p.connected ? "接続中" : "切断中"} / Lv.{p.stats.level} / {p.stats.score}pt / {p.stats.gold}G{p.skipTurns > 0 ? " / 次のターン休み" : ""}</span>
        </div>
      ))}
    </div>
  );
}

function Status({ player }: { player: Player }) {
  const bonus = gearBonus(player);
  return (
    <div className="status">
      <strong>{jobNames[player.job]} Lv.{player.stats.level}</strong>
      <span>HP {player.stats.hp}/{player.stats.maxHp}</span>
      <span>MP {player.stats.mp}/{player.stats.maxMp}</span>
      <span>物攻 {player.stats.physical + bonus.physical}（+{bonus.physical}）</span>
      <span>魔攻 {player.stats.magical + bonus.magical}（+{bonus.magical}）</span>
      <span>防御 {player.stats.defense + bonus.defense}（+{bonus.defense}）</span>
      <span>EXP {player.stats.exp} / Gold {player.stats.gold} / Score {player.stats.score}</span>
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
  return <div className="log">{logs.slice(0, 12).map((log, i) => <p key={`${log}-${i}`}>{log}</p>)}</div>;
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

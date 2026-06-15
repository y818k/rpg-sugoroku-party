"use client";

import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Gear, ItemKey, Job, Player, Room, itemCatalog, tileIcons } from "@/shared/game";

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
    setPlayerId(storage.playerId || crypto.randomUUID());
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

      <section className="board">
        <GameMap room={room} me={me} />
      </section>

      <section className="content">
        <div className="panel">
          <h2>自分</h2>
          {me && <Status player={me} />}
          {activeTile && <p className="notice">現在地: {tileIcons[activeTile.type]} {activeTile.label}</p>}
        </div>
        <div className="panel">
          <h2>プレイヤー</h2>
          <PlayerList players={room.players} currentId={playerId} />
        </div>
      </section>

      <section className="panel controls">
        {combat ? (
          <CombatPanel roomCode={roomCode} playerId={playerId} combat={combat} me={me} call={call} />
        ) : (
          <TurnControls room={room} me={me} isTurn={current?.id === playerId} call={call} />
        )}
      </section>

      <section className="panel">
        <Log logs={room.logs} />
      </section>
      {message && <div className="toast">{message}</div>}
    </main>
  );
}

function GameMap({ room, me }: { room: Room; me?: Player }) {
  const positions = useMemo(() => {
    const map = new globalThis.Map<number, Player[]>();
    room.players.forEach((p) => map.set(p.position, [...(map.get(p.position) || []), p]));
    return map;
  }, [room.players]);
  return (
    <div className="mapGrid">
      {room.tiles.map((tile, index) => (
        <div className={`tile ${tile.type} ${me?.position === index ? "mine" : ""}`} key={tile.id}>
          <span>{tileIcons[tile.type]}</span>
          <small>{tile.label}{tile.route ? `-${tile.route}` : ""}</small>
          <div className="pieces">{positions.get(index)?.map((p) => <i key={p.id}>P{p.slot}</i>)}</div>
        </div>
      ))}
    </div>
  );
}

function TurnControls({ room, me, isTurn, call }: { room: Room; me?: Player; isTurn: boolean; call: (event: string, payload?: Record<string, unknown>) => void }) {
  const inVillage = me && room.tiles[me.position]?.type === "village";
  return (
    <div className="stack">
      <div className="actions">
        <button disabled={!isTurn || room.turnRolled} onClick={() => call("turn:roll")}>ルーレット</button>
        <button disabled={!isTurn} onClick={() => call("turn:end")}>ターン終了</button>
      </div>
      {me && <Inventory me={me} call={call} inVillage={!!inVillage} />}
      {inVillage && me && <Village me={me} call={call} />}
    </div>
  );
}

function CombatPanel({ combat, me, call }: { roomCode: string; playerId: string; combat: NonNullable<Room["combat"]>; me?: Player; call: (event: string, payload?: Record<string, unknown>) => void }) {
  return (
    <div className="stack">
      <h2>戦闘: {combat.enemy.name}</h2>
      <div className="meter"><span style={{ width: `${(combat.enemy.hp / combat.enemy.maxHp) * 100}%` }} /></div>
      <p>{combat.enemy.hp}/{combat.enemy.maxHp} HP</p>
      <div className="actions">
        <button onClick={() => call("combat:command", { command: "attack" })}>攻撃</button>
        <button onClick={() => call("combat:command", { command: "skill" })}>スキル</button>
        <button disabled={combat.enemy.kind !== "mob"} onClick={() => call("combat:command", { command: "run" })}>逃げる</button>
      </div>
      <div className="items">
        {me?.inventory.items.filter((i) => i.key === "potion" || i.key === "hiPotion" || i.key === "ether" || i.key === "hiEther").map((item) => (
          <button key={item.id} onClick={() => call("combat:command", { command: "item", itemId: item.id })}>{item.name}</button>
        ))}
      </div>
      <Log logs={combat.log} />
    </div>
  );
}

function Village({ me, call }: { me: Player; call: (event: string, payload?: Record<string, unknown>) => void }) {
  return (
    <div className="village">
      <h2>村</h2>
      <div className="actions">
        <button onClick={() => call("village:recover")}>回復</button>
        {(["potion", "hiPotion", "ether", "hiEther", "warpStone", "windFeather", "luckyCharm"] as ItemKey[]).map((key) => (
          <button key={key} onClick={() => call("shop:buy", { itemKey: key })}>{itemCatalog[key].name}</button>
        ))}
      </div>
      {!me.changedJob && (
        <div className="actions">
          {(["adventurer", "warrior", "mage"] as Job[]).map((job) => (
            <button key={job} onClick={() => call("job:change", { job })}>{jobName(job)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Inventory({ me, call, inVillage }: { me: Player; call: (event: string, payload?: Record<string, unknown>) => void; inVillage: boolean }) {
  const gear = [...me.inventory.weapons, ...me.inventory.armors, ...me.inventory.accessories];
  return (
    <div className="inventory">
      <h2>アイテム</h2>
      <div className="items">
        {me.inventory.items.map((item) => (
          <button key={item.id} onClick={() => call("item:use", { itemId: item.id })}>{item.name}</button>
        ))}
      </div>
      <h2>装備</h2>
      <div className="items">
        {gear.map((g) => (
          <button className={g.rarity} key={g.id} onClick={() => call("gear:equip", { gearId: g.id })}>
            {g.name} {gearStats(g)}
          </button>
        ))}
      </div>
      {inVillage && (
        <div className="items">
          {[...gear, ...me.inventory.items].map((entry) => (
            <button key={entry.id} onClick={() => call("inventory:sell", { id: entry.id })}>売却 {entry.name}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlayerList({ players, currentId }: { players: Player[]; currentId: string }) {
  return (
    <div className="players">
      {players.map((p) => (
        <div className="player" key={p.id}>
          <b>P{p.slot} {p.name}{p.id === currentId ? " (自分)" : ""}</b>
          <span>{p.connected ? "接続中" : "切断中"} / Lv.{p.stats.level} / {p.stats.score}pt / {p.stats.gold}G</span>
        </div>
      ))}
    </div>
  );
}

function Status({ player }: { player: Player }) {
  return (
    <div className="status">
      <strong>{jobName(player.job)} Lv.{player.stats.level}</strong>
      <span>HP {player.stats.hp}/{player.stats.maxHp}</span>
      <span>MP {player.stats.mp}/{player.stats.maxMp}</span>
      <span>物攻 {player.stats.physical} / 魔攻 {player.stats.magical} / 防御 {player.stats.defense}</span>
      <span>EXP {player.stats.exp} / Gold {player.stats.gold} / Score {player.stats.score}</span>
    </div>
  );
}

function Log({ logs }: { logs: string[] }) {
  return <div className="log">{logs.slice(0, 12).map((log, i) => <p key={`${log}-${i}`}>{log}</p>)}</div>;
}

function jobName(job: Job) {
  return { adventurer: "冒険者", warrior: "戦士", mage: "魔法使い" }[job];
}

function gearStats(gear: Gear) {
  return [gear.physical ? `物+${gear.physical}` : "", gear.magical ? `魔+${gear.magical}` : "", gear.defense ? `防+${gear.defense}` : ""].filter(Boolean).join(" ");
}

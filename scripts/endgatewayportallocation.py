import math
from collections import deque

def calculate_gateway_positions(portal_x, portal_z, target_step=16):
    distance = math.sqrt(portal_x**2 + portal_z**2)
    if distance == 0:
        return "エラー: ポータル座標が原点(0,0)です"

    nx = portal_x / distance
    nz = portal_z / distance

    print("="*40)
    print(f"エンドゲートウェイ誘導ルート計算")
    print(f"入力ポータル座標: ({portal_x}, {portal_z})")
    print(f"方向ベクトル: ({nx:.4f}, {nz:.4f})")
    print("="*40)

    raycast_chunks = []
    print("\n【内部サンプリング座標 (1024 -> 768)】")
    for i in range(17):
        d = 1024.0 - (i * 16.0)
        bx = math.floor(nx * d)
        bz = math.floor(nz * d)
        cx = math.floor(bx / 16)
        cz = math.floor(bz / 16)
        raycast_chunks.append((cx, cz))
        
        marker = "★ターゲット" if i == target_step else "※回避必須"
        print(f" Step {i:02d} (距離 {d:4.0f}): ブロック({bx:5d}, {bz:5d}) -> チャンク[{cx:4d}, {cz:4d}] {marker}")

    target_chunk = raycast_chunks[target_step]
    avoid_chunks = set(raycast_chunks[:target_step])

    start_candidates = [
        (target_chunk[0] + dx, target_chunk[1] + dz)
        for dx in (-1, 0, 1) for dz in (-1, 0, 1) if not (dx == 0 and dz == 0)
    ]
    
    start_chunk = next((sc for sc in start_candidates if sc not in avoid_chunks), None)

    safe_path = []
    if start_chunk:
        queue = deque([(start_chunk, [start_chunk])])
        visited = {start_chunk}
        directions = [(0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)]

        while queue:
            curr, path = queue.popleft()
            if curr == target_chunk:
                safe_path = path
                break

            for dx, dz in directions:
                nxt = (target_chunk[0] + dx, target_chunk[1] + dz)
                if nxt not in visited and (nxt not in avoid_chunks or nxt == target_chunk):
                    if abs(nxt[0] - target_chunk[0]) <= 30 and abs(nxt[1] - target_chunk[1]) <= 30:
                        visited.add(nxt)
                        queue.append((nxt, path + [nxt]))

    print("\n" + "="*40)
    print("【建築・配置ガイド】")
    print("="*40)
    print(f"1. 島判定（エンドストーン）の配置先:\n   チャンク [{target_chunk[0]}, {target_chunk[1]}]")
    print(f"   ※このチャンク内にのみ、エンドストーンを配置してください。")
    
    print(f"\n2. 建築禁止チャンク（絶対にブロックを置かない領域）:")
    avoid_list = sorted(list(avoid_chunks))
    for ac in avoid_list:
        print(f"   チャンク [{ac[0]}, {ac[1]}]")
        
    print(f"\n3. 安全な橋の経路（チャンク座標）:")
    if safe_path:
        print("   以下のチャンク順に橋を架けることで、誤生成を回避できます。")
        for idx, step_chunk in enumerate(safe_path):
            print(f"   経路 {idx+1:02d}: チャンク [{step_chunk[0]}, {step_chunk[1]}]")
    else:
        print("   安全な経路が見つかりませんでした。手動で回避チャンクを迂回するルートを構築してください。")

# 実行
calculate_gateway_positions(29, -92)
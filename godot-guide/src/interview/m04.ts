import { md, type InterviewQ } from '../content/types';

export const QUESTIONS: InterviewQ[] = [
  {
    id: 'm04-q1',
    module: 'm04',
    area: 'godot',
    level: 1,
    q: md`Explain collision layers and masks in Godot. How would you set them up so a player's sword never hits the player?`,
    answer: md`Every collision object has a 32-bit \`collision_layer\` (the layers it is on: what it is) and a \`collision_mask\` (the layers it scans: what it looks for). Object A notices B when \`A.collision_mask & B.collision_layer\` is non-zero; for a CharacterBody2D that means B stops it, for an Area2D it means B triggers its signals. Layer $n$ is the bit $2^{n-1}$.

For attacks, give each team's hitboxes their own layer (\`player_hitbox\`, \`enemy_hitbox\`) and let hurtboxes scan only the other team's: enemy hurtboxes scan \`player_hitbox\`, the player's hurtbox scans \`enemy_hitbox\`. The sword is on \`player_hitbox\`, which the player's hurtbox never scans, so the engine never even reports the pair. No team checks in scripts are needed, and the setup is visible in the Inspector.`,
    pitfalls: [md`Off-by-one between layer numbers (from 1) and bit positions (from 0) when writing integers.`, md`Leaving new nodes on Godot's default layer 1 and mask 1, so everything collides with everything.`, md`Thinking the relationship is symmetric: in Godot 4 it is the scanner's mask against the target's layer.`],
    followups: [md`What integer is the mask for layers 1, 4 and 7?`, md`Why might a hurtbox have an empty layer?`],
  },
  {
    id: 'm04-q2',
    module: 'm04',
    area: 'math',
    level: 2,
    q: md`Fast projectiles sometimes pass through thin walls. Why, and how do you fix it?`,
    answer: md`Physics advances in discrete steps (60 per second by default). An object moved by setting its position exists only at each step's position, and overlap is tested there. If the step $v/60$ is longer than the window in which the object overlaps the wall (wall thickness plus object width), consecutive positions can land on either side of the wall: tunnelling. The chance of a hit is $60(w + b)/v$ once $v$ exceeds $60(w + b)$.

Fixes, in order of preference: sweep the motion (cast a ray or the shape from the old position to the new one each step; in Godot \`intersect_ray\`, or move the projectile as a CharacterBody2D with \`move_and_collide\`, which sweeps); enable \`continuous_cd\` on RigidBody2Ds; or constrain the design (cap speeds, thicken collision for thin walls, raise the physics tick rate), which is cheaper but limits what designers can do.`,
    pitfalls: [md`Blaming the engine instead of the discrete test.`, md`Raising the physics rate without noticing it costs every physics object, not just bullets.`],
    followups: [md`Why does a CharacterBody2D moved with move_and_slide not tunnel through walls?`, md`What is the safe speed for a 4 px bullet against a 16 px tile?`],
  },
  {
    id: 'm04-q3',
    module: 'm04',
    area: 'godot',
    level: 1,
    q: md`When would you use an Area2D, a CharacterBody2D, a RigidBody2D, a StaticBody2D and an AnimatableBody2D?`,
    answer: md`StaticBody2D for things that block and do not move (walls; tile collisions behave the same). AnimatableBody2D for blockers you move with code or animation that must carry or push characters: moving platforms, doors, lifts. CharacterBody2D for anything whose motion your code decides frame by frame, players and enemies, moved with \`move_and_slide()\`, which resolves collisions and slides along surfaces. RigidBody2D for objects the physics simulation should move (crates that tumble, debris), driven by forces and impulses rather than set velocities. Area2D for detection without blocking: hitboxes, hurtboxes, pickups, triggers, damage zones, using \`body_entered\`/\`area_entered\` signals.

The test is usually who decides the motion: nobody (static), an animation (animatable), your game logic (character), physics (rigid), or nobody needs to be blocked at all (area).`,
    pitfalls: [md`Moving a StaticBody2D every frame, which characters will not ride reliably.`, md`Using a RigidBody2D for the player and fighting the simulation for control.`],
    followups: [md`How would you make a crate that the player can push but that does not tumble?`],
  },
  {
    id: 'm04-q4',
    module: 'm04',
    area: 'combat',
    level: 2,
    q: md`How would you implement an enemy's line of sight in a top-down game, and keep it cheap with many enemies?`,
    answer: md`Three tests, cheapest first. Range: compare the squared distance to the target with the squared sight range. Cone: normalize the direction to the target and compare its dot product with the facing vector against $\cos(\text{fov}/2)$, computed once. Occlusion: cast a ray from the enemy's eyes to the target with a mask of \`world\` plus the target's layer, and accept only if the first collider is the target.

For many enemies: most fail the range test, so few rays are cast; refresh sight every few frames rather than every frame, staggering enemies so the work spreads out; keep masks tight so rays ignore other enemies; and add memory (last seen position, a short timer) so enemies do not forget the player the instant a pillar blocks the ray, which also hides the lower update rate.`,
    pitfalls: [md`Forgetting to normalize the direction before the dot product, which makes the cone widen with distance.`, md`A ray mask that includes the enemy's own layer, so it hits itself or its allies.`],
    followups: [md`How would you make sight depend on lighting or stealth?`, md`When would a shape query be better than a ray?`],
  },
  {
    id: 'm04-q5',
    module: 'm04',
    area: 'math',
    level: 2,
    q: md`Derive the formula for reflecting a velocity off a surface, and explain how it relates to sliding.`,
    answer: md`With a unit surface normal $\mathbf{n}$, split the velocity into the normal part $(\mathbf{v}\cdot\mathbf{n})\mathbf{n}$ and the tangent part $\mathbf{v} - (\mathbf{v}\cdot\mathbf{n})\mathbf{n}$, which are perpendicular. Sliding keeps only the tangent part: $\mathbf{v} - (\mathbf{v}\cdot\mathbf{n})\mathbf{n}$, which is what \`move_and_slide\` does at a wall. A mirror bounce keeps the tangent part and negates the normal part: $\mathbf{v} - 2(\mathbf{v}\cdot\mathbf{n})\mathbf{n}$. Because the parts are perpendicular and only one changes sign, the speed is preserved. A bounce with restitution $e$ uses $1 + e$ instead of 2, so $e = 0$ is a slide and $e = 1$ a perfect bounce. In Godot these are \`v.slide(n)\` and \`v.bounce(n)\`.`,
    pitfalls: [md`Using a non-unit normal, which changes the speed.`, md`Passing a normal to Godot's \`reflect\`, which expects the direction of the mirror line, not its normal; with a normal it returns the bounce negated. Use \`bounce(n)\`.`],
    followups: [md`Bounce $(100, 0)$ off a surface with normal $(-0.6, -0.8)$.`],
  },
  {
    id: 'm04-q6',
    module: 'm04',
    area: 'math',
    level: 3,
    q: md`What is the separating axis theorem, and which axes do you test for two rotated rectangles?`,
    answer: md`Two convex shapes are disjoint exactly when some axis exists on which their projections (the intervals of dot products of their points with the axis) do not overlap. For convex polygons it is enough to test the normals of their edges: if no edge normal separates them, nothing does. Two rectangles have two distinct edge directions each, so four axes. For each axis, project the four corners of each box, take min and max, and check the intervals; any gap means no collision, and the smallest overlap across all axes gives the minimum translation vector to push them apart. The axis-aligned box test is the special case where all four axes collapse to x and y. Circles add one axis: from the circle's centre to the polygon's closest vertex.`,
    pitfalls: [md`Applying it to concave shapes, where it can report false hits; split them into convex pieces.`],
    followups: [md`How many axes for a triangle against a hexagon?`],
  },
];

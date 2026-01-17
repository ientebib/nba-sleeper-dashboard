# Lock-In Fantasy Basketball: Algorithm Design

## The Game

### Format

Sleeper fantasy basketball with **lock-in scoring**:

- Each manager has a roster of ~10-13 players
- Each NBA player plays 2-4 games per week (varies by schedule)
- **Key mechanic**: You must "lock in" exactly ONE game per player per week
- That locked game becomes the player's weekly contribution to your score
- Team weekly score = sum of all locked-in games across your roster

### The Weekly Decision

For each player, every week, you face this decision:

- Player has played some games (0 to N)
- Player has some games remaining (0 to M)
- You see the scores from played games
- You must decide: **Lock one of the played games, or wait for remaining games?**

Once you lock, you cannot change it. If you wait and the player gets injured or rests, you're stuck with whatever games they played.

### Example Scenario

**Luka Doncic - Week 13:**

| Date | Matchup | Minutes | FPTS |
|------|---------|---------|------|
| Jan 12 | @ SAC | 37 | 81.1 |
| Jan 13 | vs ATL | 33 | 45.0 |
| Jan 15 | vs CHA | 36 | 51.3 |
| Jan 17 | @ DEN | ? | ? |

Current best: 81.1. One game remaining.

**Question**: Should I lock the 81.1, or wait for the Denver game?

---

## What We're Trying to Solve

### The Core Question

> Given a player's current best score S, with N games remaining,
> what is the probability they score higher than S in the remaining games?

### Secondary Questions

1. **What is this player's realistic ceiling?**
   - Not their all-time max (could be outdated)
   - Not their recent max (could be an outlier)
   - Something that represents "a great but achievable game for this player right now"

2. **What is their floor?**
   - If they play, what's the worst realistic outcome?
   - Important for risk assessment when waiting

3. **How do we account for variance?**
   - Some players are consistent (Gobert: 40-55 range)
   - Some players are volatile (Luka: 35-85 range)
   - The decision calculus differs for each type

4. **How do we handle sample size?**
   - Early season: limited data
   - Mid-season: good data
   - After trades/injuries: role changes invalidate old data

---

## Key Concepts

### "Ceiling" - What Should It Mean?

**Possible definitions:**

1. **All-time max**: The highest game ever recorded
   - Problem: Could be from a different situation (different team, role, health)

2. **Season max**: Highest game this season
   - Problem: Still could be an outlier

3. **Recent max (L2W, L4W)**: Highest game in recent weeks
   - Problem: Brittle - depends on whether they had an explosion recently

4. **Percentile-based (85th, 90th, 95th)**: Statistical upper bound
   - Problem: Which percentile? Based on what sample?

5. **Expected ceiling**: What's a "great game" for this player given their current role/minutes?
   - This is conceptually what we want, but how to calculate it?

### "Floor" - What Should It Mean?

**Possible definitions:**

1. **All-time min**: Lowest game ever
   - Problem: Could include injury-shortened games, blowouts

2. **Percentile-based (10th, 15th)**: Statistical lower bound
   - More robust than single min value

3. **Minutes-adjusted floor**: Given they play X minutes, what's the worst?
   - Accounts for health/role

### Probability of Improvement

**The math:**

If P = probability that a single game beats score S:

```
P(at least one of N games beats S) = 1 - (1-P)^N
```

**But how do we estimate P?**

- Historical frequency: What % of past games beat S?
- But which past games? All-time? Recent? Filtered by minutes?

---

## Player Archetypes

Different players require different thinking:

### Type 1: Consistent Star (e.g., Nikola Jokic)

- Narrow range: 45-65 most games
- Ceiling ~70, Floor ~40
- Easy decisions: if you have 55+, probably lock it

### Type 2: Volatile Star (e.g., Luka Doncic)

- Wide range: 35-85
- Can drop 80 or 40 any night
- Hard decisions: is 55 good enough? Could get 75, could get 40

### Type 3: Consistent Role Player (e.g., Rudy Gobert)

- Narrow range: 35-55
- Ceiling ~55, Floor ~30
- If you have 50, lock it. That's near his ceiling.

### Type 4: Volatile Role Player (e.g., streamer-tier)

- Inconsistent minutes
- High variance relative to their average
- Risky to wait, but also risky to lock low scores

---

## Questions to Answer

### About Ceiling Calculation

1. **What percentile represents "ceiling" for decision-making purposes?**
   - Is it 85th? 90th? 95th?
   - Should it vary by player type or sample size?

2. **Over what time period should we calculate ceiling?**
   - L6W? L4W? Season?
   - How do we handle role changes mid-season?

3. **Should ceiling account for minutes opportunity?**
   - A player's ceiling is constrained by minutes
   - If minutes are trending down, ceiling should too

4. **How do we handle outliers?**
   - One 80-point game in a sea of 50s - is 80 the ceiling or an outlier?
   - Should we trim outliers before calculating?

### About Probability Estimation

1. **What historical sample should we use?**
   - All season games?
   - Recent games only (L6W)?
   - Filtered by minutes threshold?

2. **Should we weight recent games more heavily?**
   - A player's current form matters
   - But how much recency bias is appropriate?

3. **How do we handle small samples?**
   - Early season, or after a player misses time
   - Confidence intervals?

### About the Decision Threshold

1. **At what probability should we switch from WAIT to LOCK?**
   - Is 30% chance to improve enough to wait?
   - Does it depend on how close we are to ceiling?

2. **Should the threshold vary by games remaining?**
   - 1 game left vs 3 games left - different risk calculus?

3. **Should we factor in injury risk?**
   - Waiting = risk of DNP
   - Some players are higher injury risk

---

## Data We Have

### Files Included

1. **all_games.csv** - Complete game log for all rostered players
   - 4,041 games across 123 players
   - Weeks 1-13 of the season
   - Columns: player, sleeper_id, nba_team, fantasy_team, date, week, matchup, minutes, fpts, fpts_per_min, pts, reb, ast, stl, blk, tov, fgm, fga, fg_pct, ftm, fta, fg3m

2. **weekly_aggregations.csv** - Pre-computed weekly stats per player
   - Columns: player, week, games_played, max_fpts, min_fpts, avg_fpts, avg_minutes

### How We Currently Calculate "Expected Lock-In"

The core metric we use is **Expected Lock-In** = average of weekly maximums.

For each player:
1. Group games by week
2. Find the MAX fpts for each week (this is what you'd lock if you picked perfectly)
3. Average those weekly maxes across all weeks played

**Example - Luka Doncic:**

| Week | Games | Max FPTS | Min FPTS | Avg FPTS |
|------|-------|----------|----------|----------|
| 1 | 2 | 87.6 | 80.0 | 83.8 |
| 2 | 2 | 64.8 | 59.8 | 62.3 |
| 3 | 2 | 75.7 | 40.7 | 58.2 |
| 4 | 4 | 69.0 | 32.8 | 54.4 |
| 5 | 2 | 58.1 | 57.4 | 57.8 |
| 6 | 3 | 82.6 | 62.7 | 69.5 |
| 7 | 2 | 64.1 | 51.4 | 57.8 |
| 8 | 2 | 50.4 | 25.1 | 37.8 |
| 9 | 2 | 102.7 | 8.8 | 55.8 |
| 10 | 2 | 57.0 | 42.4 | 49.7 |
| 11 | 3 | 62.7 | 36.4 | 49.1 |
| 12 | 3 | 63.6 | 43.7 | 52.1 |
| 13 | 3 | 81.1 | 45.0 | 59.1 |

Weekly maxes: [87.6, 64.8, 75.7, 69.0, 58.1, 82.6, 64.1, 50.4, 102.7, 57.0, 62.7, 63.6, 81.1]
**Expected Lock-In** = average = 70.7

**Example - Rudy Gobert:**

| Week | Games | Max FPTS | Min FPTS | Avg FPTS |
|------|-------|----------|----------|----------|
| 1 | 3 | 47.0 | 14.5 | 27.8 |
| 2 | 3 | 58.5 | 23.5 | 35.3 |
| 3 | 4 | 62.0 | 18.5 | 37.8 |
| 4 | 3 | 41.0 | 15.0 | 27.3 |
| 5 | 3 | 42.5 | 34.5 | 37.3 |
| 6 | 4 | 35.5 | 25.0 | 30.9 |
| 7 | 3 | 61.5 | 16.5 | 39.0 |
| 8 | 3 | 64.0 | 29.0 | 43.0 |
| 9 | 3 | 57.0 | 23.0 | 43.3 |
| 10 | 3 | 53.0 | 23.0 | 40.3 |
| 11 | 4 | 55.0 | 29.5 | 40.1 |
| 12 | 4 | 44.0 | 31.0 | 39.6 |
| 13 | 1 | 32.5 | 32.5 | 32.5 |

Weekly maxes: [47.0, 58.5, 62.0, 41.0, 42.5, 35.5, 61.5, 64.0, 57.0, 53.0, 55.0, 44.0, 32.5]
**Expected Lock-In** = average = 50.3

### Observations from the Data

**Luka's variance is extreme:**
- Week 9: 102.7 max, 8.8 min (the 8.8 was likely an injury exit - only 5 minutes played)
- Week 1: Both games were 80+ (consistent excellence)
- His weekly max ranges from 50.4 to 102.7

**Gobert is more predictable but still variable:**
- Weekly max ranges from 32.5 to 64.0
- His floor is lower than you'd think (Week 1: 14.5, Week 4: 15.0)

**Key insight:** Even "consistent" players have significant within-week variance. The max game each week varies a lot.

---

## What Would "Good" Look Like?

A good algorithm should:

1. **Be calibrated**: If we say "60% chance to improve", it should actually improve ~60% of the time

2. **Handle edge cases gracefully**:
   - Players with few games
   - Players who just had an outlier game
   - Injured players

3. **Provide actionable recommendations**:
   - Clear LOCK/WAIT/HOLD signals
   - Confidence levels
   - Supporting math the user can verify

4. **Match intuition for obvious cases**:
   - Luka at 81 with 1 game left → LOCK (obviously)
   - Gobert at 35 with 3 games left → WAIT (obviously)
   - The hard cases in between should have sensible reasoning

---

## Current Implementation Issues

1. **Ceiling seems artificially low for volatile stars**
   - Luka's ceiling showing as ~63 when he just scored 81
   - The 85th percentile doesn't capture true ceiling for high-variance players

2. **Recent max is too brittle**
   - Using max(L2W) means ceiling jumps around based on single games
   - Not statistically robust

3. **No consideration of player type**
   - Same algorithm for Jokic (consistent) and Luka (volatile)
   - Maybe they need different approaches?

---

## Next Steps

1. **Analyze historical data** to understand player distributions
   - What do ceiling distributions actually look like?
   - How much variance is there between player types?

2. **Backtest different approaches**
   - Test different percentile choices
   - Test different time windows
   - Measure calibration

3. **Define clear criteria for success**
   - What makes one algorithm better than another?
   - How do we measure "good recommendations"?

# Help Me Fix This Lock-In Algorithm

## The Problem

I built a fantasy basketball dashboard that helps with "lock-in" decisions - you have to pick ONE game per player per week to count toward your score. The algorithm is supposed to tell you: "Should I lock this score now, or wait and hope for a better game?"

**It's not working well.**

## What's Broken

### 1. Ceiling Calculation is Bad

The "ceiling" (best realistic game a player could have) is calculated wrong:

- **Current approach**: 85th percentile of recent games
- **Problem**: For volatile players like Luka Doncic, this shows a ceiling of ~63 when he literally just scored 81 and has hit 100+ this season
- **Hacky fix I tried**: `max(85th percentile, recent 2-week max)` - but this is brittle and not principled

### 2. Probability Estimation is Naive

Currently: "What % of past games beat score X?"

But:
- Which past games? All season? Last 6 weeks? Last 2 weeks?
- Should recent games count more?
- How do we handle small samples (new players, players returning from injury)?

### 3. One-Size-Fits-All Doesn't Work

Same algorithm for:
- Nikola Jokic (consistent: always scores 50-65)
- Luka Doncic (volatile: anywhere from 35-100)
- Role players with inconsistent minutes

These feel like they need different approaches.

## What I Need

A mathematically sound algorithm that:

1. **Calculates realistic ceiling/floor** - not the all-time max (outlier), not just a percentile (misses volatility)

2. **Estimates probability of improvement** - given current best score S and N games remaining, what's P(beat S)?

3. **Handles different player types** - maybe categories make sense? Or maybe there's a unified approach using variance?

4. **Doesn't overfit** - needs to work across 100+ players with different roles, minutes, and consistency levels

## Constraints

- Must be calculable from game-by-game data (I have full game logs)
- Must be explainable to users ("you have 40% chance to improve because...")
- Must handle edge cases: early season (few games), injuries, role changes

## Data Provided

1. **`LOCK_IN_ALGORITHM.md`** - Full explanation of the game, the problem, and current issues
2. **`all_games.csv`** - 4,041 games across 123 players (columns: player, date, week, minutes, fpts, etc.)
3. **`weekly_aggregations.csv`** - Per-player per-week stats (games played, max/min/avg fpts)

## Questions I'm Stuck On

1. What percentile should "ceiling" be? Should it vary by player variance?
2. How do we weight recent vs. historical games?
3. Is there a better distribution to model player scores than just empirical percentiles?
4. Should we categorize players (by variance? by role?) or use a unified approach?
5. How do we handle the cold-start problem (few games of data)?

Open to any approach - Bayesian, frequentist, whatever works. Just needs to be principled, not hacky.

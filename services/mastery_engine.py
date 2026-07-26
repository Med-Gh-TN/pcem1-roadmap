'''
@file services/mastery_engine.py
@description Pure mathematical engine for evaluating user performance and determining mastery state.
@layer Core Logic / Services
'''

def evaluate_qcm_mastery(score: int, total: int, difficulty: str, time_spent_sec: int):
    """
    AUTO-MASTERY MATH:
    Calculates a weighted score based on difficulty and penalizes slow answering.
    Returns the final verdict string, the calculated percentage, and time per question.
    """
    raw_score_pct = score / total
    
    # Difficulty Weight Multiplier
    diff_weight = {"Facile": 0.85, "Moyen": 1.0, "Difficile": 1.2}.get(difficulty, 1.0)
    
    # Time Penalty (> 60 seconds per question implies guessing/struggle)
    time_per_question = time_spent_sec / total
    time_penalty = 1.0 if time_per_question <= 60 else 0.9

    final_calc_score = raw_score_pct * diff_weight * time_penalty

    # Threshold verdicts
    if final_calc_score >= 0.85:
        verdict = 'mastered'
    elif final_calc_score >= 0.60:
        verdict = 'in_progress'
    else:
        verdict = 'needs_revision'

    return verdict, round(final_calc_score * 100, 1), round(time_per_question, 1)
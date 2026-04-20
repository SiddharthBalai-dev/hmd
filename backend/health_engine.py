"""
health_engine.py - Utility functions for the backend.
All clinical logic now lives in MODEL3.PY.
"""


def age_to_age_group(age):
    if age < 1:
        return "infant"
    if age <= 12:
        return "child"
    if age <= 35:
        return "young_adult"
    if age <= 59:
        return "middle_aged"
    if age <= 79:
        return "senior"
    return "elderly"

"""Speech permission is independent of permission to invoke tools."""
from __future__ import annotations

import math
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class Decision:
    speech: str = "silent"
    action: str = "none"
    confidence: float = 0.0
    explicit_request: bool = False

    @classmethod
    def parse(cls, value):
        try:
            speech, action = value["speech"], value["action"]
            confidence = float(value["confidence"])
            if speech not in {"speak", "silent", "clarify"} or action not in {"none", "prepare", "direct", "delegate"} or not math.isfinite(confidence) or not 0 <= confidence <= 1:
                return cls()
            explicit = value.get("explicit_request") is True
            return cls(speech, action, confidence, explicit)
        except (KeyError, TypeError, ValueError):
            return cls()


class PolicyGate:
    def __init__(self, cooldown=60, clock=time.monotonic):
        self.cooldown = max(60, cooldown)
        self.clock = clock
        self.last_clarification = -float("inf")
        self.clarified_episode = None

    def evaluate(self, decision, *, epoch, current_epoch, episode, fresh=True):
        if epoch != current_epoch or not fresh:
            return Decision()
        action = decision.action
        if action == "prepare" and decision.confidence < .85:
            action = "none"
        if action in {"direct", "delegate"} and not (decision.explicit_request and decision.confidence >= .9):
            action = "none"
        if decision.speech == "clarify":
            action = "none"
            if decision.confidence < .7 or self.clarified_episode == episode or self.clock() - self.last_clarification < self.cooldown:
                return Decision("silent", "none", decision.confidence)
            self.last_clarification = self.clock()
            self.clarified_episode = episode
        elif decision.speech == "speak" and decision.confidence < .85:
            return Decision("silent", "none", decision.confidence)
        return Decision(decision.speech, action, decision.confidence, decision.explicit_request)


DIRECT_TOOLS = frozenset({"web_search", "camera_context", "memory_read"})


def route_tool(name, decision):
    if not decision.explicit_request or decision.confidence < .9 or decision.action not in {"direct", "delegate"}:
        return "deny"
    return "direct" if name in DIRECT_TOOLS and decision.action == "direct" else "delegate"

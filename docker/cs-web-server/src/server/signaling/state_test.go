package signaling

import "testing"

func TestNegotiationEmitsOneInitialOffer(t *testing.T) {
	state := NewState()

	if !state.BeginOffer() {
		t.Fatal("initial negotiation did not produce an offer")
	}
	if state.BeginOffer() {
		t.Fatal("a second offer was produced while the first was pending")
	}
	if state.AcceptAnswer() {
		t.Fatal("an unchanged topology requested a redundant follow-up offer")
	}
	if state.BeginOffer() {
		t.Fatal("an answer without a topology change produced another offer")
	}
}

func TestNegotiationQueuesOneFollowUpForTopologyChange(t *testing.T) {
	state := NewState()
	if !state.BeginOffer() {
		t.Fatal("initial negotiation did not produce an offer")
	}

	state.Request()
	state.Request()
	if state.BeginOffer() {
		t.Fatal("topology change bypassed the outstanding offer")
	}
	if !state.AcceptAnswer() {
		t.Fatal("topology change was not retained for a follow-up offer")
	}
	if !state.BeginOffer() {
		t.Fatal("queued topology change did not produce one follow-up offer")
	}
	if state.BeginOffer() {
		t.Fatal("queued topology change produced multiple follow-up offers")
	}
	if state.AcceptAnswer() {
		t.Fatal("completed follow-up left another negotiation queued")
	}
}

func TestNegotiationRetriesFailedOffer(t *testing.T) {
	state := NewState()
	if !state.BeginOffer() {
		t.Fatal("initial negotiation did not produce an offer")
	}

	state.FailOffer()
	if !state.BeginOffer() {
		t.Fatal("failed offer was not made retryable")
	}
}

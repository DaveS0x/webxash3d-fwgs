package signaling

// State serializes offer/answer negotiation. Repeated topology changes while an
// offer is outstanding collapse into one follow-up offer after its answer.
type State struct {
	offerPending     bool
	needsNegotiation bool
}

func NewState() State {
	return State{needsNegotiation: true}
}

func (state *State) Request() {
	state.needsNegotiation = true
}

func (state *State) BeginOffer() bool {
	if state.offerPending || !state.needsNegotiation {
		return false
	}
	state.needsNegotiation = false
	state.offerPending = true
	return true
}

func (state *State) AcceptAnswer() bool {
	state.offerPending = false
	return state.needsNegotiation
}

func (state *State) FailOffer() {
	state.offerPending = false
	state.needsNegotiation = true
}

func (state *State) OfferPending() bool {
	return state.offerPending
}

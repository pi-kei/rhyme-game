import { useEffect, useReducer } from "react";

export interface CountdownTimerState {
    passed: number,
    left: number,
    duration: number,
    startAt: number,
    finishAt: number,
    isPaused: boolean
}

interface CountdownTimerReducerAction {
    type: 'update'|'reset'|'pause',
    duration?: number
}

function reducer(state: CountdownTimerState, action: CountdownTimerReducerAction): CountdownTimerState {
    if (action.type === 'update') {
        const time = Date.now();
        return {
            passed: time - state.startAt,
            left: state.finishAt - time,
            duration: state.duration,
            startAt: state.startAt,
            finishAt: state.finishAt,
            isPaused: state.isPaused
        };
    } else if (action.type === 'reset') {
        return getInitialState(action.duration!, true);
    } else if (action.type === 'pause') {
        return {
            ...state,
            isPaused: true
        }
    }
    return state;
}

function getInitialState(duration: number, autostart: boolean): CountdownTimerState {
    const time = Date.now();
    return {
        passed: 0,
        left: duration,
        duration,
        startAt: time,
        finishAt: time + duration,
        isPaused: !autostart
    };
}

export function useCountdownTimer(duration: number, autostart: boolean): [CountdownTimerState, (duration: number)=>void, ()=>void] {
    const [state, dispatch] = useReducer(reducer, getInitialState(duration, autostart));

    const reset = (newDuration: number) => {
        dispatch({type: 'reset', duration: newDuration});
    };

    const pause = () => {
        dispatch({type: 'pause'});
    };

    useEffect(() => {
        if (!state.isPaused) {
            const intervalId = setInterval(() => {
                console.log('setInterval', intervalId);
                dispatch({type: 'update'});
            }, 1000/25);
    
            return () => clearInterval(intervalId);
        }
    }, [state.isPaused]);

    return [state, reset, pause];
}
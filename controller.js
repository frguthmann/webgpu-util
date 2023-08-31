/* The controller can register callbacks for various events on a canvas:
 *
 * mousemove: function(prevMouse, this.curMouse, evt)
 *     receives both regular mouse events, and single-finger drags (sent as a left-click),
 *
 * press: function(this.curMouse, evt)
 *     receives mouse click and touch start events
 *
 * wheel: function(amount)
 *     mouse wheel scrolling
 *
 * pinch: function(amount)
 *     two finger pinch, receives the distance change between the fingers
 *
 * twoFingerDrag: function(dragVector)
 *     two finger drag, receives the drag movement amount
 */

import {vec2} from "./wgpu-matrix.module.js";
export class Controller
{
    constructor()
    {
        this.canvas = null;
        this.registeredEvents = [];

        this.mousemove = null;
        this.press = null;
        this.wheel = null;

        this.prevMouse = vec2.create();
        this.curMouse = vec2.create();
        this.touches = {};
        this.twoFingerDrag = null;
        this.pinch = null;
    }

    registerForCanvas = function (canvas)
    {
        this.canvas = canvas;

        canvas.addEventListener("mousemove", (e) => {this.registeredEvents.push({jsEvent: e, callback: this.onMouseMove.bind(this)});});
        canvas.addEventListener("mousedown", (e) => {this.registeredEvents.push({jsEvent: e, callback: this.onMouseDown.bind(this)});});
        canvas.addEventListener("wheel", (e) => {this.registeredEvents.push({jsEvent: e, callback: this.onMouseWheel.bind(this)});});
        canvas.addEventListener("touchstart", (e) => {this.registeredEvents.push({jsEvent: e, callback: this.onTouchStart.bind(this)});});
        canvas.addEventListener("touchmove", (e) => {this.registeredEvents.push({jsEvent: e, callback: this.onTouchMove.bind(this)});});
        canvas.addEventListener("touchcancel", (e) => {this.registeredEvents.push({jsEvent: e, callback: this.onTouchEnd.bind(this)});});
        canvas.addEventListener("touchend", (e) => {this.registeredEvents.push({jsEvent: e, callback: this.onTouchEnd.bind(this)});});
        canvas.oncontextmenu = (e) => {evt.preventDefault();};
    }

    processEvents ()
    {
        for (const event of this.registeredEvents)
        {
            event.callback(event.jsEvent);
        }
        this.registeredEvents.length = 0;
    }

    onMouseMove (evt)
    {
        evt.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        vec2.set(evt.clientX - rect.left, evt.clientY - rect.top, this.curMouse);

        if (this.mousemove)
        {
            this.mousemove(this.prevMouse, this.curMouse, evt);
        }
        this.prevMouse.set(this.curMouse);
    }

    onMouseDown (evt)
    {
        evt.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        vec2.set(evt.clientX - rect.left, evt.clientY - rect.top, this.curMouse);
        if (this.press)
        {
            this.press(this.curMouse, evt);
        }
    }

    onMouseWheel (evt)
    {
        evt.preventDefault();
        if (this.wheel)
        {
            this.wheel(-evt.deltaY);
        }
    }

    onTouchStart (evt)
    {
        const rect = this.canvas.getBoundingClientRect();
        evt.preventDefault();
        for (let i = 0; i < evt.changedTouches.length; ++i)
        {
            const t = evt.changedTouches[i];
            this.touches[t.identifier] = [t.clientX - rect.left, t.clientY - rect.top];
            if (evt.changedTouches.length == 1 && this.press)
            {
                this.press(this.touches[t.identifier], evt);
            }
        }
    }

    onTouchMove (evt)
    {
        evt.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const numTouches = Object.keys(this.touches).length;
        // Single finger to rotate the camera
        if (numTouches == 1)
        {
            if (this.mousemove)
            {
                const t = evt.changedTouches[0];
                const prevTouch = this.touches[t.identifier];
                const curTouch = [t.clientX - rect.left, t.clientY - rect.top];
                evt.buttons = 1;
                this.mousemove(prevTouch, curTouch, evt);
            }
        }
        else
        {
            const curTouches = {};
            for (let i = 0; i < evt.changedTouches.length; ++i)
            {
                const t = evt.changedTouches[i];
                curTouches[t.identifier] = [t.clientX - rect.left, t.clientY - rect.top];
            }

            // If some touches didn't change make sure we have them in
            // our curTouches list to compute the pinch distance
            // Also get the old touch points to compute the distance here
            const oldTouches = [];
            for (t in this.touches)
            {
                if (!(t in curTouches))
                {
                    curTouches[t] = this.touches[t];
                }
                oldTouches.push(this.touches[t]);
            }

            const newTouches = [];
            for (t in curTouches)
            {
                newTouches.push(curTouches[t]);
            }

            // Determine if the user is pinching or panning
            const motionVectors = [
                vec2.create(newTouches[0][0] - oldTouches[0][0],
                    newTouches[0][1] - oldTouches[0][1]),
                vec2.create(newTouches[1][0] - oldTouches[1][0],
                    newTouches[1][1] - oldTouches[1][1])
            ];
            var motionDirs = [vec2.create(), vec2.create()];
            vec2.normalize(motionVectors[0], motionDirs[0]);
            vec2.normalize(motionVectors[1], motionDirs[1]);

            var pinchAxis = vec2.create(oldTouches[1][0] - oldTouches[0][0],
                oldTouches[1][1] - oldTouches[0][1]);
            vec2.normalize(pinchAxis, pinchAxis);

            var panAxis = vec2.lerp(motionVectors[0], motionVectors[1], 0.5);
            vec2.normalize(panAxis, panAxis);

            var pinchMotion = [
                vec2.dot(pinchAxis, motionDirs[0]),
                vec2.dot(pinchAxis, motionDirs[1])
            ];
            var panMotion = [
                vec2.dot(panAxis, motionDirs[0]),
                vec2.dot(panAxis, motionDirs[1])
            ];

            // If we're primarily moving along the pinching axis and in the opposite direction with
            // the fingers, then the user is zooming.
            // Otherwise, if the fingers are moving along the same direction they're panning
            if (this.pinch && Math.abs(pinchMotion[0]) > 0.5 && Math.abs(pinchMotion[1]) > 0.5
                && Math.sign(pinchMotion[0]) != Math.sign(pinchMotion[1]))
            {
                // Pinch distance change for zooming
                const oldDist = Controller.pointDist(oldTouches[0], oldTouches[1]);
                const newDist = Controller.pointDist(newTouches[0], newTouches[1]);
                this.pinch(newDist - oldDist);
            }
            else if (this.twoFingerDrag && Math.abs(panMotion[0]) > 0.5 && Math.abs(panMotion[1]) > 0.5
                && Math.sign(panMotion[0]) == Math.sign(panMotion[1]))
            {
                // Pan by the average motion of the two fingers
                const panAmount = vec2.lerp(motionVectors[0], motionVectors[1], 0.5);
                panAmount[1] = -panAmount[1];
                this.twoFingerDrag(panAmount);
            }
        }

        // Update the existing list of touches with the current positions
        for (let i = 0; i < evt.changedTouches.length; ++i)
        {
            const t = evt.changedTouches[i];
            this.touches[t.identifier] = [t.clientX - rect.left, t.clientY - rect.top];
        }
    }

    onTouchEnd = function (evt)
    {
        evt.preventDefault();
        for (let i = 0; i < evt.changedTouches.length; ++i)
        {
            const t = evt.changedTouches[i];
            delete this.touches[t.identifier];
        }
    }

    static pointDist (a, b)
    {
        const v = [b[0] - a[0], b[1] - a[1]];
        return Math.sqrt(Math.pow(v[0], 2.0) + Math.pow(v[1], 2.0));
    }
}

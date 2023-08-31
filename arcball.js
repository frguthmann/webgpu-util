/* The arcball camera will be placed at the position 'eye', rotating
 * around the point 'center', with the up vector 'up'. 'screenDims'
 * should be the dimensions of the canvas or region taking mouse input
 * so the mouse positions can be normalized into [-1, 1] from the pixel
 * coordinates.
 */

import {vec2, vec3, vec4, mat3, mat4, quat} from "./libs/wgpu-matrix/wgpu-matrix.module.js";

export class ArcballCamera 
{
    constructor(eye, center, up, zoomSpeed, screenDims)
    {
        const veye = vec3.create(eye[0], eye[1], eye[2]);
        const vcenter = vec3.create(center[0], center[1], center[2]);
        const vup = vec3.create(up[0], up[1], up[2]);
        vec3.normalize(vup, vup);

        const zAxis = vec3.sub(vcenter, veye);
        const viewDist = vec3.len(zAxis);
        vec3.normalize(zAxis, zAxis);

        const xAxis = vec3.cross(zAxis, vup);
        vec3.normalize(xAxis, xAxis);

        const yAxis = vec3.cross(xAxis, zAxis);
        vec3.normalize(yAxis, yAxis);

        vec3.cross(xAxis, zAxis, yAxis);
        vec3.normalize(xAxis, xAxis);

        this.zoomSpeed = zoomSpeed;
        this.invScreen = vec2.create(1.0 / screenDims[0], 1.0 / screenDims[1]);

        this.centerTranslation = mat4.translation(center);
        mat4.invert(this.centerTranslation, this.centerTranslation);

        const vt = vec3.create(0, 0, -1.0 * viewDist);
        this.translation = mat4.translation(vt);

        const rotMat = mat3.create(xAxis[0], xAxis[1], xAxis[2],
            yAxis[0], yAxis[1], yAxis[2],
            -zAxis[0], -zAxis[1], -zAxis[2]);
        mat3.transpose(rotMat, rotMat);
        this.rotation = quat.fromMat(rotMat);
        quat.normalize(this.rotation, this.rotation);

        this.camera = mat4.create();
        this.invCamera = mat4.create();
        this.updateCameraMatrix();
    }

    rotate (prevMouse, curMouse)
    {
        const mPrev = vec2.create(
            clamp(curMouse[0] * 2.0 * this.invScreen[0] - 1.0, -1.0, 1.0),
            clamp(1.0 - prevMouse[1] * 2.0 * this.invScreen[1], -1.0, 1.0));

        const mCur = vec2.create(
            clamp(curMouse[0] * 2.0 * this.invScreen[0] - 1.0, -1.0, 1.0),
            clamp(1.0 - curMouse[1] * 2.0 * this.invScreen[1], -1.0, 1.0));

        const mPrevBall = screenToArcball(mPrev);
        const mCurBall = screenToArcball(mCur);
        // rotation = curBall * prevBall * rotation
        quat.mul( mPrevBall, this.rotation, this.rotation);
        quat.mul( mCurBall, this.rotation, this.rotation);

        this.updateCameraMatrix();
    }

    zoom (amount)
    {
        const vt = vec3.create( 0.0, 0.0, amount * this.invScreen[1] * this.zoomSpeed);
        const t = mat4.translation(vt);
        mat4.mul(t, this.translation, this.translation);
        if (this.translation[14] >= -0.2)
        {
            this.translation[14] = -0.2;
        }
        this.updateCameraMatrix();
    }

    pan (mouseDelta)
    {
        const delta = vec4.create( mouseDelta[0] * this.invScreen[0] * Math.abs(this.translation[14]),
            mouseDelta[1] * this.invScreen[1] * Math.abs(this.translation[14]), 0, 0);
        const worldDelta = vec4.transformMat4(delta, this.invCamera);
        const translation = mat4.translation(worldDelta);
        mat4.mul(translation, this.centerTranslation, this.centerTranslation);
        this.updateCameraMatrix();
    }

    updateCameraMatrix ()
    {
        // camera = translation * rotation * centerTranslation
        const rotMat = mat4.fromQuat(this.rotation);
        mat4.mul(rotMat, this.centerTranslation, this.camera);
        mat4.mul(this.translation, this.camera, this.camera);
        mat4.invert(this.camera, this.invCamera);
    }

    eyePos ()
    {
        return [this.invCamera[12], this.invCamera[13], this.invCamera[14]];
    }

    eyeDir ()
    {
        const dir = vec4.create( 0.0, 0.0, -1.0, 0.0);
        vec4.transformMat4(dir, this.invCamera, dir);
        vec4.normalize(dir, dir);
        return [dir[0], dir[1], dir[2]];
    }

    upDir ()
    {
        const dir = vec4.create( 0.0, 1.0, 0.0, 0.0);
        vec4.transformMat4(dir, this.invCamera, dir);
        vec4.normalize(dir, dir);
        return [dir[0], dir[1], dir[2]];
    }
}

function screenToArcball (p)
{
    const dist = vec2.dot(p, p);
    if (dist <= 1.0)
    {
        return quat.create( p[0], p[1], Math.sqrt(1.0 - dist), 0);
    } else
    {
        const unitP = vec2.normalize(p);
        // cgmath is w, x, y, z
        // glmatrix is x, y, z, w
        return quat.create( unitP[0], unitP[1], 0, 0);
    }
}

function clamp (a, min, max)
{
    return a < min ? min : a > max ? max : a;
}

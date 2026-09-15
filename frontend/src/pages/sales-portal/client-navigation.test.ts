import test from 'node:test';
import assert from 'node:assert/strict';
import { adjacentClient, swipeDirection } from './client-navigation.ts';
test('moves both ways across page boundaries and stops at the ends', () => {
 assert.deepEqual(adjacentClient([1,2],2,1,1,2,1),{page:2,index:0});
 assert.deepEqual(adjacentClient([3,4],3,0,2,2,-1),{page:1,index:-1});
 assert.equal(adjacentClient([1,2],1,0,1,2,-1),null);
 assert.equal(adjacentClient([3,4],4,1,2,2,1),null);
});
test('a lead removed after saving does not skip its successor or strand the previous arrow',()=>{
 assert.deepEqual(adjacentClient([1,3],2,1,1,1,1),{page:1,index:1});
 assert.deepEqual(adjacentClient([1,3],2,1,1,1,-1),{page:1,index:0});
});
test('swipes require horizontal intent and follow the displayed RTL/LTR arrows',()=>{
 assert.equal(swipeDirection(80,8,'rtl'),1);
 assert.equal(swipeDirection(-80,8,'rtl'),-1);
 assert.equal(swipeDirection(-80,8,'ltr'),1);
 assert.equal(swipeDirection(90,130,'rtl'),null);
 assert.equal(swipeDirection(15,2,'rtl'),null);
});

test('previous remains reachable when the last page becomes empty while a client is open',()=>{
 assert.deepEqual(adjacentClient([],51,0,2,1,-1),{page:1,index:-1});
 assert.equal(adjacentClient([],51,0,2,1,1),null);
});

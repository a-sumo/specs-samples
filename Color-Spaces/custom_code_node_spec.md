INSTRUCTIONS:
NO inline comments for input and output variables.
NO early returns. 

SPECIFICATION:

// Input Output Global Types
global_float GlobalFloat;
global_vec2 GlobalVec2;
global_vec3 GlobalVec3;
global_vec4 GlobalVec4;
global_mat2 GlobalMat2;
global_mat3 GlobalMat3;
global_mat4 GlobalMat4;
input_group Group( "My Inputs" );
input_droplist Droplist( "Item 1 : Item 2 : Item 3" );
input_checkbox Checkbox;
input_int Int;
input_bool Bool;
input_float Float;
input_vec2 Vec2; 
input_vec3 Vec3; 
input_vec4 Vec4;
input_color3 Color3; 
input_color4 Color4;
input_mat2 Mat2; 
input_mat3 Mat3; 
input_mat4 Mat4;
input_texture_2d Texture2D;
input_texture_2d_array Texture2DArray;
input_texture_cube TextureCube;
input_texture_3d Texture3D;
input_curve Curve;
input_voxel_data VoxelData;
input_float_array FloatArray;
output_float Output_Float;
output_vec2 Output_Vec2;
output_vec3 Output_Vec3;
output_vec4 Output_Vec4;
output_mat2 Output_Mat2;
output_mat3 Output_Mat3;
output_mat4 Output_Mat4;

void main()
{
	GlobalFloat = Float;
	GlobalVec2 = Vec2;
	GlobalVec3 = Vec3;
	GlobalVec4 = Vec4;
	GlobalMat2 = Mat2;
	GlobalMat3 = Mat3;
	GlobalMat4 = Mat4;
	
	float Value = Float;
	
	if ( Droplist == 0 )
	Value += Float;
	
	if ( Checkbox )
	Value += Float;
	
	Value += ( Int == 0 ) ? 1.0 : 0.0;
	Value += ( Bool ) ? 1.0 : 0.0;
	
	Value += Float;
	Value += Float.evaluate();
	Value += Float.evaluate();
	
	Value += Vec2.y;
	Value += Vec3.z;
	Value += Vec4.w;
	
	Value += Color3.b;
	Value += Color4.a;
	
	Value += Mat2[1].y;
	Value += Mat3[2].z;
	Value += Mat4[3].w;
	
	Value += Texture2D.sample( Vec2 ).a;
	Value += Texture2D.sample( Vec2 ).a;
	Value += Texture2D.sampleLod( Vec2, 0.0 ).a;
	Value += Texture2D.sampleDepthScreenSpace( Vec2 ).a;
	Value += Texture2D.sampleDepthViewSpace( Vec2 ).a;
	Value += Texture2D.sampleDepthViewSpacePositive( Vec2 ).a;
	Value += Texture2D.sampleDepthViewSpaceNormalized( Vec2 ).a;
	Value += Texture2D.textureSize().y;
	Value += Texture2D.pixelSize().y;
	
	Value += Texture2DArray.sample( Vec2, 0 ).a;
	Value += Texture2DArray.sampleLod( Vec2, 0, 0.0 ).a;
	Value += Texture2DArray.textureSize().y;
	Value += Texture2DArray.pixelSize().y;
	Value += Texture2DArray.arraySize();
	
	Value += TextureCube.sample( Vec3 ).a;
	Value += TextureCube.sampleLod( Vec3, 0.0 ).a;
	Value += TextureCube.textureSize();
	Value += TextureCube.pixelSize();
	
	Value += Texture3D.sample( Vec3 ).a;
	Value += Texture3D.sampleLod( Vec3, 0.0 ).a;
	Value += Texture3D.textureSize().z;
	Value += Texture3D.pixelSize().z;
	
	Value += Curve.sample( Float );
	Value += Curve.sampleMirrored( Float );
	Value += Curve.sampleRepeat( Float );
	
	Value += VoxelData.sample( Vec3 ).r;
	Value += VoxelData.sampleMirrored( Vec3 ).g;
	Value += VoxelData.sampleRepeat( Vec3 ).b;
	
	Value += FloatArray.sample( Int );
	Value += FloatArray.arraySize();
	
	Output_Float += Value;
	Output_Vec2 += Value;
	Output_Vec3 += Value;
	Output_Vec4 += Value;
	Output_Mat2 += Value;
	Output_Mat3 += Value;
	Output_Mat4 += Value;
}

// System Built-in variables and functions
output_vec4 Output; 

void main()
{
	Output = vec4( system.getSurfaceUVCoord0(), 0.0, 1.0 );
	
	/*					
	Other Available System Values
	
	vec3 system.getSurfacePosition()
	vec3 system.getSurfacePositionObjectSpace()	
	vec3 system.getSurfacePositionWorldSpace()
	vec3 system.getSurfacePositionCameraSpace()	
	vec3 system.getSurfacePositionScreenSpace()	
	
	vec3 system.getSurfaceNormal()
	vec3 system.getSurfaceNormalFaceted()
	vec3 system.getSurfaceNormalObjectSpace()
	vec3 system.getSurfaceNormalWorldSpace()
	vec3 system.getSurfaceNormalCameraSpace()
	
	vec3 system.getSurfaceTangent()
	vec3 system.getSurfaceTangentObjectSpace()	
	vec3 system.getSurfaceTangentWorldSpace()
	vec3 system.getSurfaceTangentCameraSpace()	
	
	vec3 system.getSurfaceBitangent()
	vec3 system.getSurfaceBitangentObjectSpace()	
	vec3 system.getSurfaceBitangentWorldSpace()
	vec3 system.getSurfaceBitangentCameraSpace()	
	
	vec2 system.getSurfaceUVCoord0()		
	vec2 system.getSurfaceUVCoord1()
	vec2 system.getSurfaceUVCoord2()		
	vec2 system.getSurfaceUVCoord3()
	vec2 system.getSurfaceUVCoord4()		
	vec2 system.getSurfaceUVCoord5()
	vec2 system.getSurfaceUVCoord6()		
	vec2 system.getSurfaceUVCoord7()
	
	vec4 system.getSurfaceColor()
	
	float system.getTimeElapsed()
	float system.getTimeDelta()
	
	vec2 system.getScreenUVCoord()
	
	mat4 system.getMatrixProjectionViewWorldInverse()
	mat4 system.getMatrixProjectionViewWorld()
	
	mat4 system.getMatrixProjectionViewInverse()
	mat4 system.getMatrixProjectionView()
	
	mat4 system.getMatrixViewWorldInverse()
	mat4 system.getMatrixViewWorld()
	
	mat4 system.getMatrixWorldInverse()
	mat4 system.getMatrixWorld()
	
	mat4 system.getMatrixViewInverse()
	mat4 system.getMatrixView()
	
	mat4 system.getMatrixProjectionInverse()
	mat4 system.getMatrixProjection()
	
	mat4 system.getMatrixCamera()
	mat4 system.getMatrixCameraInverse()
	
	int   system.getDirectionalLightCount();
	vec3  system.getDirectionalLightDirection( int index );
	vec3  system.getDirectionalLightColor( int Index );
	float system.getDirectionalLightIntensity( int Index );
	
	int   system.getPointLightCount();
	vec3  system.getPointLightPosition( int index );
	vec3  system.getPointLightColor( int Index );
	float system.getPointLightIntensity( int Index );
	
	int   system.getAmbientLightCount();
	vec3  system.getAmbientLightColor( int Index );
	float system.getAmbientLightIntensity( int Index );
	
	vec3 system.getCameraPosition();
	vec3 system.getCameraForward();
	vec3 system.getCameraRight();
	vec3 system.getCameraUp();
	float system.getCameraAspect();
	float system.getCameraFOV();
	float system.getCameraNear();
	float system.getCameraFar();
	
	vec3 system.getAABBMinLocal();
	vec3 system.getAABBMaxLocal();
	vec3 system.getAABBMinWorld();
	vec3 system.getAABBMaxWorld();
	
	vec3 system.getBoneWeights();
	vec3 system.getBoneIndices();
	
	int system.getStereoViewIndex();
	
	int system.getInstanceID();
	int system.getInstanceCount();
	float system.getInstanceRatio();
	
	float system.getHairStrandID();
	vec4 system.getHairDebugColor();
	
	float system.remap( float value, float min1, float max1, float min2, float max2 );
	*/
}

//Procedural Execution

global_vec2 Coords;
input_vec4 Input;
input_vec2 Scale; 
output_vec4 Output; 

void main()
{
	Output = vec4( 0.0 );
	
	for ( int u = -2; u <= 2; u++ )
	{
		for ( int v = -2; v <= 2; v++ )
		{
			Coords = system.getSurfaceUVCoord0() + vec2( float(u), float(v) ) * Scale * 0.01;
			Output += Input.evaluate();
		}
	}
	
	Output = vec4( Output.rgb / 25.0, 1.0 );
}
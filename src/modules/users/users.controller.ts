import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CreateUserDTO } from './dto/create-user.dto';
import { UsersService } from './users.service';
import type { SafeUser } from './types/users.types';
import { PassportJwtGuard } from '../auth/guards/passport-jwt.guard';

@Controller('users')
@UseGuards(PassportJwtGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  createUser(@Body() createUserDTO: CreateUserDTO): Promise<SafeUser> {
    return this.usersService.createUser(createUserDTO);
  }

  @Get()
  getAllUsers() {
    return this.usersService.getAllUsers();
  }

  @Get(':id')
  async findUserById(@Param('id', ParseUUIDPipe) id: string): Promise<SafeUser> {
    const user = await this.usersService.findUserById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
